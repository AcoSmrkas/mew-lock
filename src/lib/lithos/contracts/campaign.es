{
  // MewLock x Lithos: reward campaign, one singleton box per campaign.
  //
  // Users lock LIT for one of a fixed set of lengths. At lock time the reward
  // is taken from this box's budget and moved, together with the user's LIT,
  // into a new position box that only the user can open after its unlock
  // height. There are no admin keys: anyone can top up the budget until the
  // end, and after end + grace anyone can sweep what is left, but only to the
  // fee address baked in below.
  //
  // Reward curve, with B = LIT budget in this box and V = virtual weight (R4):
  //   weight w = principal * blocks * boostBps
  //   reward r <= B * w / (V + w),  then  B' = B - r  and  V' = V + w
  // B * V cannot grow through locks, so the budget is never over-committed and
  // splitting one lock into several earns nothing extra.
  //
  // tokens(0)  campaign NFT (amount 1)
  // tokens(1)  position markers, one leaves with every new position
  // tokens(2)  LIT budget
  // R4: BigInt V
  //
  // Named constants, substituted at compile time:
  //   _litId        Coll[Byte]  LIT token id
  //   _positionTree Coll[Byte]  exact ErgoTree bytes of the position contract
  //   _feeTree      Coll[Byte]  ErgoTree bytes of the fee address
  //   _start, _end  Int         locks allowed while _start <= HEIGHT <= _end
  //   _grace        Int         sweep allowed once HEIGHT > _end + _grace
  //   _slack        Int         most extra blocks a position may add to its tier
  //   _tierBlocks   Coll[Int]   lock lengths in blocks
  //   _tierBoost    Coll[Long]  reward multipliers, 10000 = 1.0x
  //   _minLock      Long        smallest principal, raw LIT units
  //
  // Token and register lookups on other boxes use getOrElse, never .get, and
  // each spending path lives in its own lazy if-branch, so evaluating one path
  // cannot throw on a transaction built for another. (A register holding an
  // unexpected type still throws when read, which only ever rejects a lock
  // whose own position box is malformed.)

  val nft     = SELF.tokens(0)
  val markers = SELF.tokens(1)
  val out     = OUTPUTS(0)
  val noToken = (Coll[Byte](), 0L)

  if (HEIGHT > _end + _grace) {
    // Sweep: every LIT and nanoERG goes to the fee address, and the NFT and
    // the markers are burned so this campaign can never reappear.
    val litIn = SELF.tokens.fold(0L, { (acc: Long, t: (Coll[Byte], Long)) =>
      if (t._1 == _litId) acc + t._2 else acc
    })
    val litOut = out.tokens.fold(0L, { (acc: Long, t: (Coll[Byte], Long)) =>
      if (t._1 == _litId) acc + t._2 else acc
    })
    val burned = OUTPUTS.forall({ (b: Box) =>
      b.tokens.forall({ (t: (Coll[Byte], Long)) => t._1 != nft._1 && t._1 != markers._1 })
    })
    sigmaProp(
      out.propositionBytes == _feeTree &&
      out.value >= SELF.value &&
      litOut >= litIn &&
      burned
    )
  } else {
    val lit    = SELF.tokens.getOrElse(2, noToken)
    val budget = lit._2
    val v      = SELF.R4[BigInt].get

    val outNft     = out.tokens.getOrElse(0, noToken)
    val outMarkers = out.tokens.getOrElse(1, noToken)
    val outLit     = out.tokens.getOrElse(2, noToken)
    val outV       = out.R4[BigInt].getOrElse(0.toBigInt)

    // The successor keeps this script, the NFT, the marker token id, exactly
    // three tokens and at least the same nanoERG.
    val keepsShape =
      lit._1 == _litId &&
      out.propositionBytes == SELF.propositionBytes &&
      out.tokens.size == 3 &&
      outNft._1 == nft._1 && outNft._2 == nft._2 &&
      outMarkers._1 == markers._1 &&
      outLit._1 == _litId &&
      out.value >= SELF.value

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
      val posLit    = pos.tokens.getOrElse(1, noToken)

      HEIGHT >= _start && HEIGHT <= _end &&
      v > 0.toBigInt &&
      blocks > 0 && boost > 0L &&
      principal >= _minLock &&
      reward >= 0L && reward.toBigInt <= maxReward &&
      pos.propositionBytes == _positionTree &&
      pos.R4[GroupElement].isDefined &&
      unlockAt >= HEIGHT + blocks && unlockAt <= HEIGHT + blocks + _slack &&
      pos.tokens.size == 2 &&
      posMarker._1 == markers._1 && posMarker._2 == 1L &&
      posLit._1 == _litId && posLit._2 - reward == principal &&
      outLit._2 == budget - reward &&
      outV == v + weight
    } else {
      // Top-up: anyone adds LIT and/or nanoERG before the end; nothing else moves.
      HEIGHT <= _end &&
      outMarkers._2 == markers._2 &&
      outV == v &&
      outLit._2 >= budget &&
      (outLit._2 > budget || out.value > SELF.value)
    }))
  }
}
