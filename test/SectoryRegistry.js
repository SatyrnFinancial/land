import assertRevert from './helpers/assertRevert'
import setupContracts, {
  SECTOR_NAME,
  SECTOR_SYMBOL
} from './helpers/setupContracts'
import createSectorFull from './helpers/createSectorFull'
import { getSoliditySha3 } from './helpers/getSoliditySha3'

const BigNumber = web3.BigNumber

const SectorRegistry = artifacts.require('SectorRegistryTest')
const SPACEProxy = artifacts.require('SPACEProxy')
const MiniMeToken = artifacts.require('MiniMeToken')

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'
const CURRENT_OWNER = '0x9a6ebe7e2a7722f8200d0ffb63a1f6406a0d7dce'

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

/**
 * Important:
 *   The SPACE registry uses an encoded version of the coordinates as the tokenId which you can find on SPACERegistry#encodeTokenId but
 *   you'll see that this file uses tokenIds like `1`, `2`, etc.
 *   This is because encoding a pair like `(0, 1)` returns `1`, `(0, 2)` returns `2`, and so on.
 */
contract('SectorRegistry', accounts => {
  const [
    creator,
    user,
    anotherUser,
    yetAnotherUser,
    hacker,
    operator
  ] = accounts

  let contracts = null
  let space = null
  let sector = null

  const creationParams = {
    gas: 7e6,
    gasPrice: 1e9,
    from: creator
  }
  const sentByUser = { ...creationParams, from: user }
  const sentByAnotherUser = { ...creationParams, from: anotherUser }
  const sentByCreator = { ...creationParams, from: creator }
  const sentByOperator = { ...creationParams, from: operator }
  const sentByHacker = { ...creationParams, from: hacker }

  const fiveX = [0, 0, 0, 0, 0]
  const fiveY = [1, 2, 3, 4, 5]

  const newMetadata = 'new space content'

  async function createSectorMetadata(xs, ys, owner, metadata, sendParams) {
    return createSectorFull(contracts, xs, ys, owner, metadata, sendParams)
  }

  async function createSector(xs, ys, owner, sendParams) {
    return createSectorFull(contracts, xs, ys, owner, '', sendParams)
  }

  async function createTwoSectors(owner, sendParams) {
    await space.assignMultipleParcels([0, 0], [1, 2], owner, sentByCreator)
    await createSector([0], [1], owner, sendParams)
    await createSector([0], [2], owner, sendParams)

    let sectorIds = await Promise.all([
      sector.tokenOfOwnerByIndex(owner, 0),
      sector.tokenOfOwnerByIndex(owner, 1)
    ])

    return sectorIds.map(id => id.toNumber())
  }

  async function createUserSectorWithToken1() {
    await space.assignMultipleParcels([0], [1], user, sentByCreator)
    return createSector([0], [1], user, sentByUser)
  }

  async function createUserSectorWithToken2() {
    await space.assignMultipleParcels([0], [2], user, sentByCreator)
    return createSector([0], [2], user, sentByUser)
  }

  async function createUserSectorWithNumberedTokens() {
    await space.assignMultipleParcels(fiveX, fiveY, user, sentByCreator)
    return createSector(fiveX, fiveY, user, sentByUser)
  }

  async function createAnotherUserSectorWithNumberedTokens() {
    await space.assignMultipleParcels(fiveY, fiveX, anotherUser, sentByCreator)
    return createSector(fiveY, fiveX, anotherUser, sentByAnotherUser)
  }

  async function assertSectorCount(owner, expectedCount) {
    const tokenCount = await sector.balanceOf.call(owner)
    tokenCount.toNumber().should.be.equal(expectedCount)
  }

  async function assertRegistry(requiredRegistry) {
    const registry = await sector.registry.call()
    registry.should.be.equal(requiredRegistry)
  }

  async function assertMetadata(sectorId, requiredMetadata) {
    const metadata = await sector.getMetadata.call(sectorId)
    metadata.should.be.equal(requiredMetadata)
  }

  async function assertNFTBalance(user, expected) {
    const balance = await space.balanceOf(user)
    balance.toString().should.be.equal(expected.toString())
  }

  async function assertSectorSize(sectorId, expected) {
    const balance = await sector.getSectorSize(sectorId)
    balance.toString().should.be.equal(expected.toString())
  }

  async function assertNFTOwner(assetId, expectedOwner) {
    const owner = await space.ownerOf(assetId)
    owner.should.be.equal(expectedOwner)
  }

  function transferOut(sectorId, index, who = sentByUser, to = anotherUser) {
    return sector.transferSpace(sectorId, index, to, who)
  }

  function transferIn(sectorId, spaceId, userAddress = anotherUser) {
    return space.safeTransferFromToSector(
      userAddress,
      sector.address,
      spaceId,
      sectorId,
      getParams(userAddress)
    )
  }

  function getParams(userAddress) {
    let params = sentByAnotherUser

    if (userAddress === user) {
      params = sentByUser
    } else if (userAddress === creator) {
      params = sentByCreator
    }

    return params
  }

  async function assertSpaceIdAtIndex(sectorId, index, value) {
    const spaceId = await sector.sectorSpaceIds.call(sectorId, index)
    spaceId.toString().should.be.equal(value.toString())
  }

  function assertEvent(log, expectedEventName, expectedArgs) {
    const { event, args } = log
    event.should.be.eq(expectedEventName)

    for (let key in expectedArgs) {
      let value = args[key]
      if (value instanceof BigNumber) {
        value = value.toString()
      }

      value.should.be.equal(expectedArgs[key], `[assertEvent] ${key}`)
    }
  }

  async function getSectorEvents(eventName) {
    return new Promise((resolve, reject) => {
      sector[eventName]().get(function(err, logs) {
        if (err) reject(new Error(`Error fetching the ${eventName} events`))
        resolve(logs)
      })
    })
  }

  beforeEach(async function() {
    contracts = await setupContracts(creator, creationParams)
    sector = contracts.sector
    space = contracts.space
  })

  describe('name', function() {
    it('has a name', async function() {
      const name = await sector.name()
      name.should.be.equal(SECTOR_NAME)
    })
  })

  describe('symbol', function() {
    it('has a symbol', async function() {
      const symbol = await sector.symbol()
      symbol.should.be.equal(SECTOR_SYMBOL)
    })
  })

  describe('set SPACE Registry', function() {
    it('set works correctly', async function() {
      const registry = await SPACEProxy.new(creationParams)
      await sector.setSPACERegistry(registry.address, creationParams)
      await assertRegistry(registry.address)
    })

    it('should throw if setting a non-contract', async function() {
      await assertRevert(sector.setSPACERegistry(hacker, creationParams))
    })

    it('unauthorized user can not set registry', async function() {
      const registry = await SPACEProxy.new(creationParams)
      await assertRevert(
        sector.setSPACERegistry(registry.address, sentByAnotherUser)
      )
    })
  })

  describe('create Sector', function() {
    it('the registry can create sectors', async function() {
      await createTwoSectors(user, sentByUser)
      await assertSectorCount(user, 2)
    })

    it('only the registry can create sectors', async function() {
      await assertRevert(sector.mint(user, ''))
    })

    it('supports setting the metadata on create', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)

      const metadata = 'name,description'
      const sectorId = await createSectorMetadata(
        [0],
        [1],
        user,
        metadata,
        sentByUser
      )
      await assertMetadata(sectorId, metadata)
    })

    it('should emit the CreateSector event on mint', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)

      const metadata = 'name,description'
      const { logs } = await sector.mintSector(user, metadata)

      logs.length.should.be.equal(2)

      // ERC721
      assertEvent(logs[0], 'Transfer', {
        _from: EMPTY_ADDRESS,
        _to: user,
        _tokenId: '1'
      })

      // Sector
      assertEvent(logs[1], 'CreateSector', {
        _owner: user,
        _sectorId: '1',
        _data: metadata
      })
    })

    it('should allow operator to create an sector', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      await space.setApprovalForAll(anotherUser, true, sentByUser)
      await createSector([0], [1], user, sentByAnotherUser)
      await assertSectorCount(user, 1)
    })

    it('fails if sender is not owner or operator of all SPACEs', async function() {
      await space.assignMultipleParcels([0, 0], [1, 2], user, sentByCreator)
      await space.approve(anotherUser, 1, sentByUser)
      await assertRevert(
        createSector([0, 0], [1, 2], anotherUser, sentByAnotherUser)
      )
    })

    it('fails if somebody else tries to steal SPACE', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      await assertRevert(createSector([0], [1], anotherUser, sentByAnotherUser))
    })
  })

  describe('transfer many Sectors', function() {
    it('the owner can transfer many sectors', async function() {
      const sectorIds = await createTwoSectors(user, sentByUser)

      await sector.safeTransferManyFrom(
        user,
        anotherUser,
        sectorIds,
        sentByUser
      )

      await assertSectorCount(user, 0)
      await assertSectorCount(anotherUser, 2)
    })

    it('only the owner can transfer many sectors', async function() {
      const sectorIds = await createTwoSectors(user, sentByUser)
      await assertRevert(
        sector.safeTransferManyFrom(
          user,
          anotherUser,
          sectorIds,
          sentByAnotherUser
        )
      )
    })
  })

  describe('update metadata and update operator', function() {
    it('update works correctly :: holder', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.updateMetadata(sectorId, newMetadata, sentByUser)
      await assertMetadata(sectorId, newMetadata)
    })

    it('update works correctly :: updateOperator', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      await sector.updateMetadata(sectorId, newMetadata, sentByAnotherUser)
      await assertMetadata(sectorId, newMetadata)
    })

    it('update works correctly :: operator', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.approve(anotherUser, sectorId, sentByUser)
      await sector.updateMetadata(sectorId, newMetadata, sentByAnotherUser)
      await assertMetadata(sectorId, newMetadata)
    })

    it('update works correctly :: approved for all', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await sector.updateMetadata(sectorId, newMetadata, sentByAnotherUser)
      await assertMetadata(sectorId, newMetadata)
    })

    it('unauthorized user can not update', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.updateMetadata(sectorId, newMetadata, sentByAnotherUser)
      )
    })

    it('unauthorized user can not set update operator', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.setUpdateOperator(sectorId, yetAnotherUser, sentByAnotherUser)
      )
    })

    it('update operator can not transfer tokens out', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      await assertRevert(
        sector.transferSpace(sectorId, 1, yetAnotherUser, sentByAnotherUser)
      )
    })

    it('should not allow an owner of an Sector transfer tokens out from an Sector which is not the owner', async function() {
      const sectorId = await createUserSectorWithToken1()
      await space.assignMultipleParcels([0], [2], anotherUser, sentByCreator)
      await createSector([0], [2], anotherUser, sentByAnotherUser)
      await assertRevert(sector.transferSpace(sectorId, 2, user, sentByUser))
    })
  })

  describe('transfer tokens', function() {
    it('owner can transfer tokens in', async function() {
      const sectorId = await createUserSectorWithToken1()
      await space.assignMultipleParcels([0], [2], user, sentByCreator)
      await transferIn(sectorId, 2, user)
      await assertSectorSize(sectorId, 2)
    })

    it('transfering tokens in fires the AddSpace event', async function() {
      const spaceId = '2'
      const sectorId = await createUserSectorWithToken1()
      await space.assignMultipleParcels([0], [2], user, sentByCreator)

      let logs = await getSectorEvents('AddSpace')
      logs.length.should.be.equal(0)

      await transferIn(sectorId, 2, user)
      logs = await getSectorEvents('AddSpace')

      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'AddSpace', { _sectorId: sectorId, _spaceId: spaceId })
    })

    it('user cannot transfer tokens to an undefined sector', async function() {
      const sectorId = '1'
      await space.assignMultipleParcels([0], [2], user, sentByCreator)
      await assertRevert(transferIn(sectorId, 2, user))
    })

    it('random user can transfer tokens in', async function() {
      const sectorId = await createUserSectorWithToken1()
      await space.assignMultipleParcels([0], [2], anotherUser, sentByCreator)
      await transferIn(sectorId, 2, anotherUser)
      await assertSectorSize(sectorId, 2)
    })

    it('owner can transfer tokens out', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.transferSpace(sectorId, 1, anotherUser, sentByUser)
      await assertSectorSize(sectorId, 0)
      await assertNFTOwner(1, anotherUser)
    })

    it('random user can not transfer tokens out', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.transferSpace(sectorId, 1, hacker, sentByAnotherUser)
      )
    })

    it('random user can not transfer many tokens out', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.transferManySpaces(sectorId, [1], hacker, sentByAnotherUser)
      )
    })

    it('owner can not transfer tokens out to the empty address', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.transferSpace(sectorId, 1, EMPTY_ADDRESS, sentByUser)
      )
    })

    it('transfering tokens out should emit the RemoveSpace event', async function() {
      const spaceId = '1'
      const sectorId = await createUserSectorWithToken1()

      let logs = await getSectorEvents('RemoveSpace')
      logs.length.should.be.equal(0)

      await sector.transferSpace(sectorId, spaceId, anotherUser, sentByUser)

      logs = await getSectorEvents('RemoveSpace')

      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'RemoveSpace', {
        _sectorId: sectorId,
        _spaceId: spaceId
      })
    })

    it('owner can transfer many tokens out', async function() {
      const sectorId = await createUserSectorWithNumberedTokens()
      await sector.transferManySpaces(
        sectorId,
        [1, 2, 3],
        anotherUser,
        sentByUser
      )
      await assertSectorSize(sectorId, 2)
    })
  })

  describe('operator transfering tokens', function() {
    it('operator can transfer tokens out', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await transferOut(sectorId, 1, sentByAnotherUser)
    })

    it('operator can transfer many tokens out', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await sector.transferManySpaces(
        sectorId,
        [1],
        anotherUser,
        sentByAnotherUser
      )
    })

    it('operator can not transfer tokens out after deauth', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await transferOut(sectorId, 1, sentByAnotherUser)
      await transferIn(sectorId, 1)
      await sector.setApprovalForAll(anotherUser, false, sentByUser)
      await assertRevert(transferOut(sectorId, 1, sentByAnotherUser))
    })

    it('operator can not transfer many tokens out after deauth', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await transferOut(sectorId, 1, sentByAnotherUser)
      await transferIn(sectorId, 1)
      await sector.setApprovalForAll(anotherUser, false, sentByUser)
      await assertRevert(
        sector.transferManySpaces(sectorId, [1], anotherUser, sentByAnotherUser)
      )
    })
  })

  describe('order of tokens is correctly accounted', function() {
    it('five in, middle out, one in, middle out', async function() {
      const sectorId = await createUserSectorWithNumberedTokens()
      await assertNFTBalance(sector.address, 5)
      await transferOut(sectorId, 2)
      await assertSpaceIdAtIndex(sectorId, 1, 5)
      await transferIn(sectorId, 2)
      await assertSpaceIdAtIndex(sectorId, 4, 2)
      await transferOut(sectorId, 3)
      await assertSpaceIdAtIndex(sectorId, 2, 2)
    })

    it('five in, empty, refill', async function() {
      const sectorId = await createUserSectorWithNumberedTokens()
      await transferOut(sectorId, 2)
      await transferOut(sectorId, 1)
      await transferOut(sectorId, 3)
      await transferOut(sectorId, 4)
      await transferOut(sectorId, 5)
      await assertNFTBalance(sector.address, 0)
      await transferIn(sectorId, 2)
      await transferIn(sectorId, 1)
      await transferIn(sectorId, 3)
      await transferIn(sectorId, 4)
      await transferIn(sectorId, 5)
      await assertNFTBalance(sector.address, 5)
      await assertSpaceIdAtIndex(sectorId, 0, 2)
      await assertSpaceIdAtIndex(sectorId, 1, 1)
      await assertSpaceIdAtIndex(sectorId, 2, 3)
      await assertSpaceIdAtIndex(sectorId, 3, 4)
      await assertSpaceIdAtIndex(sectorId, 4, 5)
    })
  })

  describe('fingerprint management', function() {
    it('supports verifyFingerprint interface', async function() {
      const isSupported = await sector.supportsInterface(
        web3.sha3('verifyFingerprint(uint256,bytes)')
      )
      expect(isSupported).be.true
    })

    it('creates the fingerprint correctly', async function() {
      const sectorId = await createUserSectorWithNumberedTokens()
      const expectedHash = await getSectorHash(sectorId, fiveX, fiveY)
      const fingerprint = await sector.getFingerprint(sectorId)

      expect(fingerprint).to.be.equal(expectedHash)
    })

    it('should change the fingerprint as the composable children change', async function() {
      const sectorId = await createUserSectorWithNumberedTokens()
      const firstHash = await getSectorHash(sectorId, fiveX, fiveY)

      let fingerprint

      await space.assignMultipleParcels([10, 11], [-1, -19], user, sentByCreator)
      const newSpaceIds = await Promise.all([
        space.encodeTokenId(10, -1),
        space.encodeTokenId(11, -19)
      ])

      await transferIn(sectorId, newSpaceIds[0], user)
      fingerprint = await sector.getFingerprint(sectorId)
      expect(fingerprint).not.to.be.equal(firstHash)

      fingerprint = await sector.getFingerprint(sectorId)
      await transferIn(sectorId, newSpaceIds[1], user)
      expect(fingerprint).not.to.be.equal(firstHash)

      await transferOut(sectorId, newSpaceIds[0], sentByUser)
      await transferOut(sectorId, newSpaceIds[1], sentByUser)

      fingerprint = await sector.getFingerprint(sectorId)
      expect(fingerprint).to.be.equal(firstHash)
    })

    it('should encode only the id on empty sectors', async function() {
      await space.assignMultipleParcels([0], [0], user, sentByCreator)
      const sectorId = await createSector([0], [0], user, sentByUser)
      await transferOut(sectorId, 0, sentByUser)

      const expectedHash = getSoliditySha3('sectorId', sectorId)
      const fingerprint = await sector.getFingerprint(sectorId)

      expect(fingerprint).to.be.equal(expectedHash)
    })

    it('should generate the same hash even if the parcel order changes', async function() {
      await space.assignMultipleParcels(fiveX, fiveY, user, sentByCreator)
      const sectorId = await createSector(fiveX, fiveY, user, sentByUser)

      const fingerprint = await sector.getFingerprint(sectorId)

      // Remove SPACEs
      for (const [index, x] of fiveX.entries()) {
        const y = fiveY[index]
        const spaceId = await space.encodeTokenId(x, y)
        await sector.transferSpace(sectorId, spaceId, user, sentByUser)
      }

      // Reverse order
      for (const [index, x] of fiveX.reverse().entries()) {
        const y = fiveY[index]
        const spaceId = await space.encodeTokenId(x, y)
        await transferIn(sectorId, spaceId, user)
      }

      // Regenerate fingerprint
      const reverseFingerprint = await sector.getFingerprint(sectorId)

      expect(fingerprint).to.be.equal(reverseFingerprint)
    })

    it('verifies the fingerprint correctly', async function() {
      const sectorId = await createUserSectorWithNumberedTokens()
      const expectedHash = await getSectorHash(sectorId, fiveX, fiveY)
      const result = await sector.verifyFingerprint(sectorId, expectedHash)
      expect(result).to.be.true
    })

    async function getSectorHash(sectorId, xCoords, yCoords) {
      const firstSpaceId = await space.encodeTokenId(xCoords[0], yCoords[0])

      let expectedHash = await contracts.sector.calculateXor(
        'sectorId', // salt
        sectorId,
        firstSpaceId
      )

      for (let i = 1; i < xCoords.length; i++) {
        const spaceId = await space.encodeTokenId(xCoords[i], yCoords[i])
        expectedHash = await contracts.sector.compoundXor(expectedHash, spaceId)
      }

      return expectedHash
    }

    it('should not have checksum collision with one SPACE', async function() {
      const sectorId1 = await createUserSectorWithToken2() // Sector Id: 1, Space Id: 2
      const sectorId2 = await createUserSectorWithToken1() // Sector Id: 2, Space Id: 1
      const fingerprint1 = await sector.getFingerprint(sectorId1)
      const fingerprint2 = await sector.getFingerprint(sectorId2)
      expect(fingerprint1).to.not.be.equal(fingerprint2)
    })

    it('should not have checksum collision with multiple SPACEs', async function() {
      const sectorId1 = await createUserSectorWithNumberedTokens()
      const sectorId2 = await createAnotherUserSectorWithNumberedTokens()
      const fingerprint1 = await sector.getFingerprint(sectorId1)
      const fingerprint2 = await sector.getFingerprint(sectorId2)
      expect(fingerprint1).to.not.be.equal(fingerprint2)
    })
  })

  describe('SPACE update', function() {
    it('should allow owner of an Sector to update SPACE data', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      const sectorId = await createSector([0], [1], user, sentByUser)
      await sector.updateSpaceData(sectorId, 1, 'newValue', sentByUser)
      const data = await space.spaceData(0, 1, sentByUser)
      data.should.be.equal('newValue')
    })

    it('should allow operator of an Sector to update SPACE data', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      const sectorId = await createSector([0], [1], user, sentByUser)
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await sector.updateSpaceData(sectorId, 1, 'newValue', sentByAnotherUser)
      const data = await space.spaceData(0, 1, sentByUser)
      data.should.be.equal('newValue')
    })

    it('should allow update operator of an Sector to update SPACE data', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      const sectorId = await createSector([0], [1], user, sentByUser)
      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      await sector.updateSpaceData(sectorId, 1, 'newValue', sentByAnotherUser)
      const data = await space.spaceData(0, 1, sentByUser)
      data.should.be.equal('newValue')
    })

    it('should allow a SPACE updateOperator to update SPACE data', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setSpaceUpdateOperator(sectorId, 1, anotherUser, sentByUser)
      await sector.updateSpaceData(sectorId, 1, 'newValue', sentByAnotherUser)
      const data = await space.spaceData(0, 1, sentByUser)
      data.should.be.equal('newValue')
    })

    it('should not allow owner an Sector to update SPACE data of an Sector which is not the owner', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      const sectorIdByUser = await createSector([0], [1], user, sentByUser)
      await space.assignMultipleParcels([0], [2], anotherUser, sentByCreator)
      await createSector([0], [2], anotherUser, sentByAnotherUser)
      await assertRevert(
        sector.updateSpaceData(sectorIdByUser, 2, 'newValue', sentByUser)
      )
    })

    it('should not allow neither operator, nor owner nor updateOperator nor SPACE updateOperator of an Sector to update SPACE data', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      const sectorId = await createSector([0], [1], user, sentByUser)
      await assertRevert(
        sector.updateSpaceData(sectorId, 1, 'newValue', sentByAnotherUser)
      )
    })

    it('should not allow old owner to update SPACE data after creating an Sector', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      await createSector([0], [1], user, sentByUser)
      await assertRevert(space.updateSpaceData(0, 1, 'newValue', sentByUser))
    })

    it('should not allow old operator to update SPACE data after creating an Sector', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      await space.setApprovalForAll(anotherUser, true, sentByUser)
      const sectorId = await createSector([0], [1], user, sentByAnotherUser)
      await assertRevert(
        space.updateSpaceData(sectorId, 1, 'newValue', sentByAnotherUser)
      )
    })
  })

  describe('SPACEs update', function() {
    it('should allow owner of an Sector to update SPACEs data', async function() {
      await space.assignMultipleParcels([0, 0], [1, 2], user, sentByCreator)
      const sectorId = await createSector([0, 0], [1, 2], user, sentByUser)
      await sector.updateManySpaceData(sectorId, [1, 2], 'newValue', sentByUser)
      const spacesData = await Promise.all([
        space.spaceData(0, 1, sentByUser),
        space.spaceData(0, 2, sentByUser)
      ])

      spacesData.forEach(data => data.should.be.equal('newValue'))
    })

    it('should allow operator of an Sector to update SPACEs data', async function() {
      await space.assignMultipleParcels([0, 0], [1, 2], user, sentByCreator)
      const sectorId = await createSector([0, 0], [1, 2], user, sentByUser)
      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await sector.updateManySpaceData(
        sectorId,
        [1, 2],
        'newValue',
        sentByAnotherUser
      )
      const spacesData = await Promise.all([
        space.spaceData(0, 1, sentByUser),
        space.spaceData(0, 2, sentByUser)
      ])

      spacesData.forEach(data => data.should.be.equal('newValue'))
    })

    it('should allow update operator of an Sector to update SPACEs data', async function() {
      await space.assignMultipleParcels([0, 0], [1, 2], user, sentByCreator)
      const sectorId = await createSector([0, 0], [1, 2], user, sentByUser)
      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      await sector.updateManySpaceData(
        sectorId,
        [1, 2],
        'newValue',
        sentByAnotherUser
      )
      const spacesData = await Promise.all([
        space.spaceData(0, 1, sentByUser),
        space.spaceData(0, 2, sentByUser)
      ])

      spacesData.forEach(data => data.should.be.equal('newValue'))
    })

    it('should not allow owner an Sector to update SPACEs data of an Sector which is not the owner', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      const sectorIdByUser = await createSector([0], [1], user, sentByUser)
      await space.assignMultipleParcels([0], [2], anotherUser, sentByCreator)
      await createSector([0], [2], anotherUser, sentByAnotherUser)
      await assertRevert(
        sector.updateManySpaceData(sectorIdByUser, [2], 'newValue', sentByUser)
      )
    })

    it('should not allow neither operator nor owner nor updateOperator of an Sector to update SPACEs data', async function() {
      await space.assignMultipleParcels([0, 0], [1, 2], user, sentByCreator)
      const sectorId = await createSector([0, 0], [1, 2], user, sentByUser)
      await assertRevert(
        sector.updateManySpaceData(
          sectorId,
          [1, 2],
          'newValue',
          sentByAnotherUser
        )
      )
    })

    it('should not allow old owner to update SPACEs data after creating an Sector', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      await createSector([0], [1], user, sentByUser)
      await assertRevert(
        space.updateManySpaceData([0], [1], 'newValue', sentByUser)
      )
    })

    it('should not allow old operator to update SPACEs data after creating an Sector', async function() {
      await space.assignMultipleParcels([0], [1], user, sentByCreator)
      await space.setApprovalForAll(anotherUser, true, sentByUser)
      await createSector([0], [1], user, sentByAnotherUser)
      await assertRevert(
        space.updateManySpaceData([0], [1], 'newValue', sentByAnotherUser)
      )
    })
  })

  describe('support interfaces', function() {
    it('should support InterfaceId_GetMetadata interface', async function() {
      const interfaceId = await sector.getMetadataInterfaceId()
      const isSupported = await sector.supportsInterface(interfaceId)
      expect(isSupported).be.true
    })

    it('should support inherited InterfaceId_ERC721 and InterfaceId_ERC721Exists interfaces', async function() {
      let interfaceId = '0x80ac58cd' // InterfaceId_ERC721
      let isSupported = await sector.supportsInterface(interfaceId)
      expect(isSupported).be.true

      interfaceId = '0x4f558e79' // InterfaceId_ERC721Exists
      isSupported = await sector.supportsInterface(interfaceId)
      expect(isSupported).be.true
    })

    it('should not support not defined interface', async function() {
      const isSupported = await sector.supportsInterface('123456')
      expect(isSupported).be.false
    })
  })

  describe('Update Operator', function() {
    it('should clean update operator after transfer the Sector :: safeTransferFrom', async function() {
      const sectorId = await createUserSectorWithToken1()

      let owner = await sector.ownerOf(sectorId)
      owner.should.be.equal(user)

      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      let updateOperator = await sector.updateOperator(sectorId, sentByUser)
      expect(updateOperator).be.equal(anotherUser)

      await sector.safeTransferFrom(user, anotherUser, sectorId, sentByUser)

      let logs = await getSectorEvents('UpdateOperator')
      expect(logs.length).be.equal(0)
      logs = await getSectorEvents('Transfer')
      expect(logs.length).be.equal(1)

      updateOperator = await sector.updateOperator(sectorId, sentByUser)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      owner = await sector.ownerOf(sectorId)
      owner.should.be.equal(anotherUser)
    })

    it('should clean update operator after transfer the Sector :: safeTransferFrom with bytes', async function() {
      const sectorId = await createUserSectorWithToken1()

      let owner = await sector.ownerOf(sectorId)
      owner.should.be.equal(user)

      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      let updateOperator = await sector.updateOperator(sectorId, sentByUser)
      expect(updateOperator).be.equal(anotherUser)

      await sector.safeTransferFromWithBytes(
        user,
        anotherUser,
        sectorId,
        '0x',
        sentByUser
      )

      let logs = await getSectorEvents('UpdateOperator')
      expect(logs.length).be.equal(0)
      logs = await getSectorEvents('Transfer')
      expect(logs.length).be.equal(1)

      updateOperator = await sector.updateOperator(sectorId, sentByUser)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      owner = await sector.ownerOf(sectorId)
      owner.should.be.equal(anotherUser)
    })

    it('should clean update operator after transfer the Sector :: transferFrom', async function() {
      const sectorId = await createUserSectorWithToken1()

      let owner = await sector.ownerOf(sectorId)
      owner.should.be.equal(user)

      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      let updateOperator = await sector.updateOperator(sectorId, sentByUser)
      expect(updateOperator).be.equal(anotherUser)

      await sector.transferFrom(user, anotherUser, sectorId, sentByUser)

      let logs = await getSectorEvents('UpdateOperator')
      expect(logs.length).be.equal(0)

      logs = await getSectorEvents('Transfer')
      expect(logs.length).be.equal(1)

      updateOperator = await sector.updateOperator(sectorId, sentByUser)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      owner = await sector.ownerOf(sectorId)
      owner.should.be.equal(anotherUser)
    })

    it('should clean update operator after transfer the Sector :: safeTransferManyFrom', async function() {
      const sectorIds = await createTwoSectors(user, sentByUser)

      let owner = await sector.ownerOf(sectorIds[0])
      owner.should.be.equal(user)

      owner = await sector.ownerOf(sectorIds[1])
      owner.should.be.equal(user)

      await sector.setUpdateOperator(sectorIds[0], anotherUser, sentByUser)
      let updateOperator = await sector.updateOperator(sectorIds[0], sentByUser)
      expect(updateOperator).be.equal(anotherUser)

      await sector.setUpdateOperator(sectorIds[1], anotherUser, sentByUser)
      updateOperator = await sector.updateOperator(sectorIds[1], sentByUser)
      expect(updateOperator).be.equal(anotherUser)

      await sector.safeTransferManyFrom(
        user,
        anotherUser,
        sectorIds,
        sentByUser
      )

      let logs = await getSectorEvents('UpdateOperator')
      expect(logs.length).be.equal(0)

      logs = await getSectorEvents('Transfer')
      expect(logs.length).be.equal(2)

      updateOperator = await sector.updateOperator(sectorIds[0], sentByUser)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
      updateOperator = await sector.updateOperator(sectorIds[1], sentByUser)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      owner = await sector.ownerOf(sectorIds[0])
      owner.should.be.equal(anotherUser)

      owner = await sector.ownerOf(sectorIds[1])
      owner.should.be.equal(anotherUser)
    })

    it('should set an update operator by updateManager', async function() {
      await createUserSectorWithToken1()

      let updateOperator = await sector.updateOperator(1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.setUpdateManager(user, operator, true, sentByUser)
      await sector.setUpdateOperator(1, anotherUser, sentByOperator)

      updateOperator = await sector.updateOperator(1)
      expect(updateOperator).be.equal(anotherUser)
    })
  })

  describe('Update SPACE Update Operator', function() {
    it('should update SPACE updateOperator by sector owner', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setSpaceUpdateOperator(sectorId, 1, anotherUser, sentByUser)
      const updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should update SPACE updateOperator by sector operator', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.approve(anotherUser, sectorId, sentByUser)
      await sector.setSpaceUpdateOperator(
        sectorId,
        1,
        yetAnotherUser,
        sentByAnotherUser
      )
      const updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(yetAnotherUser)
    })

    it('should update SPACE updateOperator by updateManager', async function() {
      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(EMPTY_ADDRESS)

      await sector.setUpdateManager(user, anotherUser, true, sentByUser)

      const sectorId = await createUserSectorWithToken1()

      await sector.setSpaceUpdateOperator(
        sectorId,
        1,
        yetAnotherUser,
        sentByAnotherUser
      )

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(yetAnotherUser)
    })

    it('should clean SPACE updateOperator', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setSpaceUpdateOperator(
        sectorId,
        1,
        yetAnotherUser,
        sentByUser
      )
      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(yetAnotherUser)

      await sector.setSpaceUpdateOperator(sectorId, 1, EMPTY_ADDRESS, sentByUser)
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(EMPTY_ADDRESS)

      await sector.approve(anotherUser, sectorId, sentByUser)
      await sector.setSpaceUpdateOperator(
        sectorId,
        1,
        yetAnotherUser,
        sentByAnotherUser
      )
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(yetAnotherUser)

      await sector.setSpaceUpdateOperator(
        sectorId,
        1,
        EMPTY_ADDRESS,
        sentByAnotherUser
      )
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(EMPTY_ADDRESS)
    })

    it('reverts when updating SPACE updateOperator by sector updateOperator', async function() {
      const sectorId = await createUserSectorWithToken1()
      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)
      await assertRevert(
        sector.setSpaceUpdateOperator(
          sectorId,
          2,
          yetAnotherUser,
          sentByAnotherUser
        )
      )
    })

    it('reverts when updating SPACE updateOperator for a SPACE outside the sector', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.setSpaceUpdateOperator(sectorId, 2, anotherUser, sentByUser)
      )
    })

    it('reverts when updating SPACE updateOperator for a SPACE from another sector', async function() {
      const sectorId = await createUserSectorWithToken1()
      await createUserSectorWithToken2()
      await assertRevert(
        sector.setSpaceUpdateOperator(sectorId, 2, anotherUser, sentByUser)
      )
    })

    it('reverts when updating SPACE updateOperator by hacker', async function() {
      const sectorId = await createUserSectorWithToken1()
      await assertRevert(
        sector.setSpaceUpdateOperator(
          sectorId,
          1,
          anotherUser,
          sentByAnotherUser
        )
      )
    })
  })

  describe('UpdateManager', function() {
    beforeEach(async function() {
      await createTwoSectors(user, sentByUser)
    })

    it('should set updateManager by owner', async function() {
      const { logs } = await sector.setUpdateManager(
        user,
        operator,
        true,
        sentByUser
      )
      // Event emitted
      logs.length.should.be.equal(1)

      const log = logs[0]
      log.event.should.be.eq('UpdateManager')
      log.args._owner.should.be.bignumber.equal(user)
      log.args._operator.should.be.equal(operator)
      log.args._caller.should.be.equal(user)
      log.args._approved.should.be.equal(true)

      let isUpdateManager = await sector.updateManager(user, operator)
      isUpdateManager.should.be.equal(true)

      await sector.setUpdateManager(user, operator, false, sentByUser)
      isUpdateManager = await sector.updateManager(user, operator)
      isUpdateManager.should.be.equal(false)
    })

    it('should set updateManager by approvedForAll', async function() {
      await sector.setApprovalForAll(anotherUser, true, sentByUser)

      const { logs } = await sector.setUpdateManager(
        user,
        operator,
        true,
        sentByAnotherUser
      )
      // Event emitted
      logs.length.should.be.equal(1)

      const log = logs[0]
      log.event.should.be.eq('UpdateManager')
      log.args._owner.should.be.bignumber.equal(user)
      log.args._operator.should.be.equal(operator)
      log.args._caller.should.be.equal(anotherUser)
      log.args._approved.should.be.equal(true)

      let isUpdateManager = await sector.updateManager(user, operator)
      isUpdateManager.should.be.equal(true)

      await sector.setUpdateManager(user, operator, false, sentByAnotherUser)
      isUpdateManager = await sector.updateManager(user, operator)
      isUpdateManager.should.be.equal(false)
    })

    it('should allow updateManager to update content', async function() {
      await assertMetadata(1, '')
      await assertMetadata(2, '')

      await sector.setUpdateManager(user, operator, true, sentByUser)

      await sector.updateMetadata(1, 'newValue', sentByOperator)
      await sector.updateMetadata(2, 'newValue', sentByOperator)

      await assertMetadata(1, 'newValue')
      await assertMetadata(2, 'newValue')
    })

    it('should allow updateManager to update content on new Sector', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)

      await space.assignMultipleParcels([0, 0], [3, 4], user, sentByCreator)
      const sectorId = await createSector([0, 0], [3, 4], user, sentByUser)

      await assertMetadata(sectorId, '')

      await sector.updateMetadata(sectorId, 'newValue', sentByOperator)

      await assertMetadata(sectorId, 'newValue')
    })

    it('should allow updateManager to update content on SPACEs as part of the Sector', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)

      let data = await space.spaceData(0, 1)
      data.should.be.equal('')

      await sector.updateSpaceData(1, 1, 'newValue', sentByOperator)

      data = await space.spaceData(0, 1)
      data.should.be.equal('newValue')
    })

    it('should has false as default value for updateManager', async function() {
      const isUpdateManager = await sector.updateManager(user, operator)
      isUpdateManager.should.be.equal(false)
    })

    it('should set multiple updateManager', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)
      await sector.setUpdateManager(user, anotherUser, true, sentByUser)

      let isUpdateManager = await sector.updateManager(user, operator)
      isUpdateManager.should.be.equal(true)

      isUpdateManager = await sector.updateManager(user, anotherUser)
      isUpdateManager.should.be.equal(true)
    })

    it('clears updateManager correctly ', async function() {
      await assertMetadata(1, '')

      await sector.setUpdateManager(user, operator, true, sentByUser)

      await sector.updateMetadata(1, 'newValue', sentByOperator)

      await assertMetadata(1, 'newValue')

      await sector.setUpdateManager(user, operator, false, sentByUser)

      await assertRevert(sector.updateMetadata(1, 'again', sentByOperator))
    })

    it('reverts when updateManager trying to change content of no owned by the owner Sector', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)

      await sector.transferFrom(user, anotherUser, 1, sentByUser)

      await assertMetadata(2, '', sentByOperator)

      await sector.updateMetadata(2, 'newValue', sentByOperator)

      await assertMetadata(2, 'newValue', sentByOperator)

      await assertRevert(sector.updateMetadata(1, 'newValue', sentByOperator))
    })

    it('reverts if owner set himself as updateManager', async function() {
      await assertRevert(sector.setUpdateManager(user, user, true, sentByUser))
    })

    it('reverts if not owner or approvedForAll set updateManager', async function() {
      // Not owner
      await assertRevert(
        sector.setUpdateManager(user, operator, true, sentByAnotherUser)
      )

      // Hacker
      await assertRevert(
        sector.setUpdateManager(user, operator, true, sentByHacker)
      )

      // Operator
      await sector.approve(operator, 1, sentByUser)
      await assertRevert(
        sector.setUpdateManager(user, operator, true, sentByOperator)
      )

      // Update Operator
      await sector.setUpdateOperator(1, anotherUser, sentByUser)
      await assertRevert(
        sector.setUpdateManager(user, operator, true, sentByAnotherUser)
      )
    })

    it('reverts when updateManager trying to transfer', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(
        sector.transferFrom(user, anotherUser, 1, sentByOperator)
      )
    })

    it('reverts when updateManager trying to set updateManager', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(
        sector.setUpdateManager(user, anotherUser, 1, sentByOperator)
      )
    })

    it('reverts when updateManager trying to set operator', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(sector.approve(anotherUser, 1, sentByOperator))
    })

    it('reverts when updateManager trying move SPACEs from Sector', async function() {
      await sector.setUpdateManager(user, operator, true, sentByUser)

      await assertRevert(sector.transferSpace(1, 1, anotherUser, sentByOperator))
    })
  })

  describe('setManyUpdateOperator', function() {
    let sectorId1
    let sectorId2
    beforeEach(async function() {
      sectorId1 = await createUserSectorWithToken1()
      sectorId2 = await createUserSectorWithToken2()
    })

    it('should set update operator', async function() {
      let updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.setManyUpdateOperator([sectorId1], operator, sentByUser)

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(operator)
    })

    it('should set many update operator :: owner', async function() {
      let updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.setManyUpdateOperator(
        [sectorId1, sectorId2],
        operator,
        sentByUser
      )

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(operator)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(operator)
    })

    it('should set many update operator :: approvedForAll', async function() {
      let updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.setApprovalForAll(anotherUser, true, sentByUser)
      await sector.setManyUpdateOperator(
        [sectorId1, sectorId2],
        operator,
        sentByAnotherUser
      )

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(operator)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(operator)
    })

    it('should set many update operator :: operator', async function() {
      let updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.approve(anotherUser, sectorId1, sentByUser)
      await sector.approve(anotherUser, sectorId2, sentByUser)

      await sector.setManyUpdateOperator(
        [sectorId1, sectorId2],
        operator,
        sentByAnotherUser
      )

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(operator)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(operator)
    })

    it('should set many update operator :: updateManager', async function() {
      let updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.setUpdateManager(user, anotherUser, true, sentByUser)

      await sector.setManyUpdateOperator(
        [sectorId1, sectorId2],
        operator,
        sentByAnotherUser
      )

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(operator)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(operator)
    })

    it('should clean many update operator', async function() {
      let updateOperator
      await sector.setManyUpdateOperator(
        [sectorId1, sectorId2],
        anotherUser,
        sentByUser
      )

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(anotherUser)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(anotherUser)

      await sector.setManyUpdateOperator(
        [sectorId1, sectorId2],
        EMPTY_ADDRESS,
        sentByUser
      )

      updateOperator = await sector.updateOperator(sectorId1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
      updateOperator = await sector.updateOperator(sectorId2)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)
    })

    it('reverts when updateOperator try to set many update operator', async function() {
      await sector.setUpdateOperator(sectorId1, anotherUser, sentByUser)

      await assertRevert(
        sector.setManyUpdateOperator([sectorId1], operator, sentByAnotherUser)
      )
    })

    it('reverts when unauthorized user try to set many update operator', async function() {
      await assertRevert(
        sector.setManyUpdateOperator([sectorId1], operator, sentByAnotherUser)
      )
    })
  })

  describe('setManySpaceUpdateOperator', function() {
    let sectorId
    let updateOperator
    beforeEach(async function() {
      sectorId = await createUserSectorWithNumberedTokens()
      updateOperator = EMPTY_ADDRESS
    })

    it('should set SPACE update operator', async function() {
      updateOperator = await space.updateOperator(1)
      expect(updateOperator).be.equal(EMPTY_ADDRESS)

      await sector.setManySpaceUpdateOperator(
        sectorId,
        [1],
        anotherUser,
        sentByUser
      )

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set many SPACE update operator :: owner', async function() {
      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(EMPTY_ADDRESS)
      }

      await sector.setManySpaceUpdateOperator(
        sectorId,
        fiveY,
        anotherUser,
        sentByUser
      )

      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(anotherUser)
      }
    })

    it('should set many SPACE update operator :: approvedForAll', async function() {
      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(EMPTY_ADDRESS)
      }

      await sector.setApprovalForAll(anotherUser, true, sentByUser)

      await sector.setManySpaceUpdateOperator(
        sectorId,
        fiveY,
        operator,
        sentByAnotherUser
      )

      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(operator)
      }
    })

    it('should set many SPACE update operator :: operator', async function() {
      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(EMPTY_ADDRESS)
      }

      await sector.approve(anotherUser, sectorId, sentByUser)
      await sector.setManySpaceUpdateOperator(
        sectorId,
        fiveY,
        operator,
        sentByAnotherUser
      )

      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(operator)
      }
    })

    it('should set many SPACE update operator :: updateManager', async function() {
      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(EMPTY_ADDRESS)
      }

      await sector.setUpdateManager(user, anotherUser, true, sentByUser)

      await sector.setManySpaceUpdateOperator(
        sectorId,
        fiveY,
        operator,
        sentByAnotherUser
      )

      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(operator)
      }
    })

    it('should clean many SPACE update operator', async function() {
      await sector.setManySpaceUpdateOperator(
        sectorId,
        fiveY,
        anotherUser,
        sentByUser
      )

      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(anotherUser)
      }

      await sector.setManySpaceUpdateOperator(
        sectorId,
        fiveY,
        EMPTY_ADDRESS,
        sentByUser
      )

      for (let id of fiveY) {
        updateOperator = await space.updateOperator(id)
        expect(updateOperator).be.equal(EMPTY_ADDRESS)
      }
    })

    it('reverts when updateOperator try to set many SPACE update operator', async function() {
      await sector.setUpdateOperator(sectorId, anotherUser, sentByUser)

      await assertRevert(
        sector.setManySpaceUpdateOperator(
          sectorId,
          fiveY,
          yetAnotherUser,
          sentByAnotherUser
        )
      )
    })

    it('reverts when setting SPACE updateOperator for a SPACE outside the sector', async function() {
      await space.assignMultipleParcels([0], [6], user, sentByCreator)
      await createSector([0], [6], user, sentByUser)

      await assertRevert(
        sector.setManySpaceUpdateOperator(sectorId, [6], anotherUser, sentByUser)
      )
    })

    it('reverts when unauthorized user try to set many update operator', async function() {
      await assertRevert(
        sector.setManySpaceUpdateOperator(
          sectorId,
          fiveY,
          operator,
          sentByAnotherUser
        )
      )
    })
  })

  describe('SPACEs size', function() {
    it('should return the amount of SPACEs', async () => {
      const sectorId1 = await createUserSectorWithNumberedTokens()

      await space.assignMultipleParcels([1], [1], user, sentByCreator)
      const sectorId2 = await createSector([1], [1], user, sentByUser)

      await space.assignMultipleParcels([1, 1], [2, 3], user, sentByCreator)
      const sectorId3 = await createSector([1, 1], [2, 3], user, sentByUser)

      let totalSize = (await sector.getSectorSize(sectorId1)).toNumber()
      totalSize += (await sector.getSectorSize(sectorId2)).toNumber()
      totalSize += (await sector.getSectorSize(sectorId3)).toNumber()

      const SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(totalSize)
    })

    it('should update the amount of SPACEs', async () => {
      const sectorId1 = await createUserSectorWithNumberedTokens()

      await space.assignMultipleParcels([1], [1], user, sentByCreator)
      const sectorId2 = await createSector([1], [1], user, sentByUser)

      await space.assignMultipleParcels([1, 1], [2, 3], user, sentByCreator)
      const sectorId3 = await createSector([1, 1], [2, 3], user, sentByUser)

      let totalSize = (await sector.getSectorSize(sectorId1)).toNumber()
      totalSize += (await sector.getSectorSize(sectorId2)).toNumber()
      totalSize += (await sector.getSectorSize(sectorId3)).toNumber()

      let SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(totalSize)
      totalSize.should.be.equal(8)

      await space.assignMultipleParcels(
        [1, 1, 1, 1],
        [4, 5, 6, 7],
        user,
        sentByCreator
      )
      const sectorId4 = await createSector(
        [1, 1, 1, 1],
        [4, 5, 6, 7],
        user,
        sentByUser
      )

      totalSize += (await sector.getSectorSize(sectorId4)).toNumber()

      SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(totalSize)
      totalSize.should.be.equal(12)

      await transferOut(sectorId1, 1)

      totalSize--

      SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(totalSize)
      totalSize.should.be.equal(11)

      await space.assignMultipleParcels([0], [8], user, sentByCreator)
      // Sector4 should have 5 SPACEs now
      await transferIn(sectorId4, 8, user)

      totalSize++

      SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(totalSize)
      totalSize.should.be.equal(12)

      await sector.safeTransferFrom(user, anotherUser, sectorId4, sentByUser)
      totalSize -= (await sector.getSectorSize(sectorId4)).toNumber()

      SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(totalSize)
      totalSize.should.be.equal(7)
    })

    it('should returns 0 for an address with 0 Sectors', async () => {
      const SPACESize = await sector.getSPACEsSize(user)
      SPACESize.toNumber().should.be.equal(0)
    })
  })

  describe('SpaceBalance', function() {
    let spaceBalance
    let sectorBalance
    let sectorId1

    async function getSectorBalanceEvents(eventName) {
      return new Promise((resolve, reject) => {
        sectorBalance[eventName]().get(function(err, logs) {
          if (err) reject(new Error(`Error fetching the ${eventName} events`))
          resolve(logs)
        })
      })
    }

    beforeEach(async function() {
      spaceBalance = MiniMeToken.at(await space.spaceBalance())
      sectorBalance = MiniMeToken.at(await sector.sectorSpaceBalance())

      sectorId1 = await createUserSectorWithNumberedTokens()
    })

    describe('setBalanceToken', function() {
      it('should set balance token', async function() {
        const { logs } = await sector.setSectorSpaceBalance(user, sentByCreator)

        // Event emitted
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('SetSectorSpaceBalanceToken')
        log.args._previousSectorSpaceBalance.should.be.equal(
          sectorBalance.address
        )
        log.args._newSectorSpaceBalance.should.be.equal(user)
      })
    })

    describe('Register balance', function() {
      it('should register balance', async function() {
        const isRegistered = await sector.registeredBalance(user)
        expect(isRegistered).equal(false)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        // Register
        await sector.registerBalance(sentByUser)
        const logs = await getSectorBalanceEvents('Transfer')
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('Transfer')
        log.args._from.should.be.equal(EMPTY_ADDRESS)
        log.args._to.should.be.equal(user)
        log.args._amount.should.be.bignumber.equal(5)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        await space.assignNewParcel(0, 6, user, sentByCreator)
        await createSector([0], [6], user, sentByUser)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(6)

        await transferOut(sectorId1, 1, sentByUser)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)
      })

      it('should unregister balance', async function() {
        // Register
        await sector.registerBalance(sentByUser)

        let isRegistered = await sector.registeredBalance(user)
        expect(isRegistered).equal(true)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        // Unregister
        await sector.unregisterBalance(sentByUser)

        const logs = await getSectorBalanceEvents('Transfer')
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('Transfer')
        log.args._from.should.be.equal(user)
        log.args._to.should.be.equal(EMPTY_ADDRESS)
        log.args._amount.should.be.bignumber.equal(5)

        isRegistered = await sector.registeredBalance(user)
        expect(isRegistered).equal(false)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)
      })

      it('reverts re-register balance', async function() {
        await sector.registerBalance(sentByAnotherUser)
        await assertRevert(sector.registerBalance(sentByAnotherUser))
      })

      it('reverts re-unregister balance', async function() {
        await sector.registerBalance(sentByAnotherUser)
        await sector.unregisterBalance(sentByAnotherUser)
        await assertRevert(sector.unregisterBalance(sentByAnotherUser))
      })
    })

    describe('Update balance', function() {
      beforeEach(async function() {
        await sector.registerBalance(sentByUser)
      })

      it('should register balance only one balance', async function() {
        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        await sector.transferFrom(user, anotherUser, sectorId1, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        const isAnotherUserRegistered = await space.registeredBalance(
          anotherUser
        )
        expect(isAnotherUserRegistered).equal(false)

        const anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        let spaceRegistryBalance = await spaceBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)
      })

      it('should register owner balance if it was transferred by operator :: approvalForAll', async function() {
        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        await sector.setApprovalForAll(operator, true, sentByUser)
        await sector.transferFrom(user, anotherUser, sectorId1, sentByOperator)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        const operatorBalance = await sectorBalance.balanceOf(operator)
        operatorBalance.should.be.bignumber.equal(0)

        const anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)
      })

      it('should register owner balance if it was transferred by operator :: Operator', async function() {
        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        await sector.approve(operator, sectorId1, sentByUser)
        await sector.transferFrom(user, anotherUser, sectorId1, sentByOperator)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        const operatorBalance = await sectorBalance.balanceOf(operator)
        operatorBalance.should.be.bignumber.equal(0)

        const anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)
      })

      it('should register balance both', async function() {
        await sector.registerBalance(sentByAnotherUser)

        const isAnotherUserRegistered = await sector.registeredBalance(
          anotherUser
        )
        expect(isAnotherUserRegistered).equal(true)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        await sector.transferFrom(user, anotherUser, sectorId1, sentByUser)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        const anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(5)
      })

      it('should not register transfer to the space registry', async function() {
        const isSPACERegistered = await sector.registeredBalance(space.address)
        expect(isSPACERegistered).equal(false)

        const isSectorRegistered = await space.registeredBalance(sector.address)
        expect(isSectorRegistered).equal(false)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        let userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(5)

        let sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        let spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await space.assignNewParcel(0, 6, user, sentByCreator)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(5)

        sectorRegistryBalance = await sectorBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await space.transferSpaceToSector(0, 6, sectorId1, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(6)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await transferOut(sectorId1, 1, sentByUser)

        let anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await space.registerBalance(sentByAnotherUser)

        anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(1)
      })

      it('should register space balance and sector balance', async function() {
        await space.registerBalance(sentByUser)

        let isSectorRegistered = await space.registeredBalance(sector.address)
        expect(isSectorRegistered).equal(false)

        let isSPACERegistered = await sector.registeredBalance(space.address)
        expect(isSPACERegistered).equal(false)

        let userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(0)

        let userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(5)

        let sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        let spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await transferOut(sectorId1, 1, sentByUser, user)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(1)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(4)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await transferOut(sectorId1, 2, sentByUser, user)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(3)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        let ownSpaceBalance = await spaceBalance.balanceOf(space.address)
        ownSpaceBalance.should.be.bignumber.equal(0)

        let ownSectorBalance = await sectorBalance.balanceOf(sector.address)
        ownSectorBalance.should.be.bignumber.equal(0)

        let operatorSpaceBalance = await spaceBalance.balanceOf(operator)
        operatorSpaceBalance.should.be.bignumber.equal(0)

        let operatorSectorBalance = await sectorBalance.balanceOf(operator)
        operatorSectorBalance.should.be.bignumber.equal(0)

        await sector.transferManySpaces(sectorId1, [3, 4], operator, sentByUser)

        operatorSpaceBalance = await spaceBalance.balanceOf(operator)
        operatorSpaceBalance.should.be.bignumber.equal(0)

        operatorSectorBalance = await sectorBalance.balanceOf(operator)
        operatorSectorBalance.should.be.bignumber.equal(0)

        await space.registerBalance(sentByOperator)
        await sector.registerBalance(sentByOperator)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(1)

        operatorSpaceBalance = await spaceBalance.balanceOf(operator)
        operatorSpaceBalance.should.be.bignumber.equal(2)

        operatorSectorBalance = await sectorBalance.balanceOf(operator)
        operatorSectorBalance.should.be.bignumber.equal(0)
      })

      it('should update on transfer :: transferFrom', async function() {
        await sector.registerBalance(sentByAnotherUser)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        let anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await sector.transferFrom(user, anotherUser, sectorId1, sentByUser)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(5)
      })

      it('should update on transfer :: safeTransferFrom', async function() {
        await sector.registerBalance(sentByAnotherUser)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        let anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await sector.safeTransferFrom(user, anotherUser, sectorId1, sentByUser)

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(5)
      })

      it('should update on transfer :: safeTransferFrom with bytes', async function() {
        await sector.registerBalance(sentByAnotherUser)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(5)

        let anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await sector.safeTransferFromWithBytes(
          user,
          anotherUser,
          sectorId1,
          '0x00',
          sentByUser
        )

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(5)
      })

      it('should update on transfer :: safeTransferManyFrom', async function() {
        await sector.registerBalance(sentByAnotherUser)

        await space.assignNewParcel(0, 6, user, sentByCreator)
        const sectorId2 = await createSector([0], [6], user, sentByUser)

        let userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(6)

        let anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await sector.safeTransferManyFrom(
          user,
          anotherUser,
          [sectorId1, sectorId2],
          sentByUser
        )

        userBalance = await sectorBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        anotherUserBalance = await sectorBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(6)
      })
    })
  })
})
