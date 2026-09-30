{
  // MewLock campaign: lock asset A, earn asset B. One singleton box per campaign.
  //
  // A and B are each a token or ERG (an empty id means ERG), and may be the
  // same asset. Users lock A for one of a fixed set of lengths. At lock time the
  // reward in B is taken from this box's budget and moved, together with the
  // locked A, into a new position box that only the user can open after its
  // unlock height. There are no admin keys: anyone can top up the budget until
  // the end, and after end + grace anyone can sweep what is left, but only to
  // the fee address baked in below.
  //
  // Reward curve, with budget in B and V = virtual weight (R4):
  //   weight w = principal * blocks * boostBps       (principal in raw A units)
  //   reward r <= budget * w / (V + w)               (reward in raw B units)
  //   then budget' = budget - r  and  V' = V + w
  // budget * V cannot grow through locks, so the budget is never over-committed
  // and splitting one lock into several earns nothing extra.
  //
  // tokens(0)  campaign NFT (amount 1)
  // tokens(1)  position markers, one leaves with every new position
  // tokens(2)  budget, when B is a token
  // value      budget + _reserve, when B is ERG
  // R4: BigInt V
  //
  // Named constants, substituted at compile time:
  //   _stakeId      Coll[Byte]  token locked (A); empty = ERG
  //   _rewardId     Coll[Byte]  token paid (B); empty = ERG
  //   _positionTree Coll[Byte]  exact ErgoTree bytes of the position contract
  //   _feeTree      Coll[Byte]  ErgoTree bytes of the fee address
  //   _start, _end  Int         locks allowed while _start <= HEIGHT <= _end
  //   _grace        Int         sweep allowed once HEIGHT > _end + _grace
  //   _slack        Int         most extra blocks a position may add to its tier
  //   _tierBlocks   Coll[Int]   lock lengths in blocks
  //   _tierBoost    Coll[Long]  reward multipliers, 10000 = 1.0x
  //   _minLock      Long        smallest principal, raw A units
  //   _deposit      Long        nanoERG each position carries besides any ERG it locks or earns
  //   _reserve      Long        nanoERG kept in this box that is never budget (B = ERG only)
  //
  // This is the v2 campaign contract. Deployments made from this source set
  // `contractVersion: 2` in their pinned deployment JSON. Existing v1
  // campaigns remain supported by the UI, but cannot be changed on-chain.

  val stakeIsErg  = _stakeId.size == 0
  val rewardIsErg = _rewardId.size == 0
  val sameAsset   = _stakeId == _rewardId
  // B travels as its own token entry (not ERG, not merged into A's).
  // (Named up front: the typer cannot type `if (a || b)` nested in arithmetic.)
  val rewardOwnToken = !(rewardIsErg || sameAsset)

  val nft     = SELF.tokens(0)
  val markers = SELF.tokens(1)
  val out     = OUTPUTS(0)
  val noToken = (Coll[Byte](), 0L)

  // Raw amount of A / B tokens in a box (0 when absent).
  val stakeIn = { (b: Box) =>
    b.tokens.fold(0L, { (acc: Long, t: (Coll[Byte], Long)) => if (t._1 == _stakeId) acc + t._2 else acc })
  }
  val rewardIn = { (b: Box) =>
    b.tokens.fold(0L, { (acc: Long, t: (Coll[Byte], Long)) => if (t._1 == _rewardId) acc + t._2 else acc })
  }
  // Budget held by a campaign box, in raw B units.
  val budgetOf = { (b: Box) => if (rewardIsErg) b.value - _reserve else rewardIn(b) }

  if (HEIGHT > _end + _grace) {
    // Sweep: every nanoERG and every B token goes to the fee address, and the
    // NFT and the markers are burned so this campaign can never reappear.
    val burned = OUTPUTS.forall({ (b: Box) =>
      b.tokens.forall({ (t: (Coll[Byte], Long)) => t._1 != nft._1 && t._1 != markers._1 })
    })
    sigmaProp(
      // A sweep may only validate the campaign at input zero. Without this,
      // two expired campaigns with the same fee tree could be co-spent while
      // one payout output covered only the larger balance.
      SELF.id == INPUTS(0).id &&
      out.propositionBytes == _feeTree &&
      out.value >= SELF.value &&
      (rewardIsErg || rewardIn(out) >= rewardIn(SELF)) &&
      burned
    )
  } else {
    val budget = budgetOf(SELF)
    val v      = SELF.R4[BigInt].get

    val outNft     = out.tokens.getOrElse(0, noToken)
    val outMarkers = out.tokens.getOrElse(1, noToken)
    val outV       = out.R4[BigInt].getOrElse(0.toBigInt)
    val outBudget  = budgetOf(out)

    // The successor keeps this script, the NFT and the marker token id, and
    // holds exactly the budget token when B is a token.
    val keepsShape =
      out.propositionBytes == SELF.propositionBytes &&
      outNft._1 == nft._1 && outNft._2 == nft._2 &&
      outMarkers._1 == markers._1 &&
      (if (rewardIsErg) out.tokens.size == 2
       else out.tokens.size == 3 && out.tokens.getOrElse(2, noToken)._1 == _rewardId)

    // Only a lock releases a marker. Everything that reads OUTPUTS(1) stays
    // inside the lock branch, so a top-up never evaluates it: a register of an
    // unexpected type there would make the read throw.
    val isLock = outMarkers._2 == markers._2 - 1L

    sigmaProp(keepsShape && (if (isLock) {
      // Lock: exactly one new position, in OUTPUTS(1).
      val pos       = OUTPUTS.getOrElse(1, SELF)
      val unlockAt  = pos.R5[Int].getOrElse(-1)
      val principal = pos.R6[Long].getOrElse(-1L)
      val reward    = pos.R7[Long].getOrElse(-1L)
      val tier      = pos.R8[Int].getOrElse(-1)
      val blocks    = _tierBlocks.getOrElse(tier, 0)
      val boost     = _tierBoost.getOrElse(tier, 0L)
      val weight    = (if (principal > 0L) principal else 0L).toBigInt * blocks.toBigInt * boost.toBigInt
      val maxReward = budget.toBigInt * weight / (v + weight)
      val posMarker = pos.tokens.getOrElse(0, noToken)

      // What the position must hold besides its marker: A and B, as tokens or ERG.
      val ergA      = if (stakeIsErg) principal else 0L
      val ergB      = if (rewardIsErg) reward else 0L
      val tokA      = if (stakeIsErg) 0L else principal + (if (sameAsset) reward else 0L)
      val tokB      = if (rewardOwnToken) reward else 0L
      // A reward-token position with a rounded-down reward owns no reward
      // token entry. Ergo boxes cannot carry a token amount of zero.
      // Keep this deliberately nested. The ErgoScript typer does not support a
      // boolean conjunction inside an `if` which feeds token-count arithmetic.
      val rewardTokenSlot = if (rewardOwnToken) { if (reward > 0L) 1 else 0 } else 0
      val posTokens = 1 + (if (stakeIsErg) 0 else 1) + rewardTokenSlot

      HEIGHT >= _start && HEIGHT <= _end &&
      v > 0.toBigInt &&
      blocks > 0 && boost > 0L &&
      principal >= _minLock &&
      reward >= 0L && reward.toBigInt <= maxReward &&
      pos.propositionBytes == _positionTree &&
      pos.R4[GroupElement].isDefined &&
      unlockAt >= HEIGHT + blocks && unlockAt <= HEIGHT + blocks + _slack &&
      posMarker._1 == markers._1 && posMarker._2 == 1L &&
      pos.tokens.size == posTokens &&
      pos.value == _deposit + ergA + ergB &&
      (stakeIsErg || stakeIn(pos) == tokA) &&
      (!rewardOwnToken || rewardIn(pos) == tokB) &&
      outBudget == budget - reward &&
      outV == v + weight &&
      (rewardIsErg || out.value >= SELF.value)
    } else {
      // Top-up: anyone adds budget (and/or nanoERG) before the end; nothing else moves.
      HEIGHT <= _end &&
      outMarkers._2 == markers._2 &&
      outV == v &&
      out.value >= SELF.value &&
      outBudget >= budget &&
      (outBudget > budget || out.value > SELF.value)
    }))
  }
}
