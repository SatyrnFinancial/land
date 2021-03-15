import assertRevert from './helpers/assertRevert'
import setupContracts, {
  SPACE_NAME,
  SPACE_SYMBOL
} from './helpers/setupContracts'
import createSectorFull from './helpers/createSectorFull'

const MiniMeToken = artifacts.require('MiniMeToken')

const BigNumber = web3.BigNumber

const NONE = '0x0000000000000000000000000000000000000000'

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

function checkDeployAuthorizedLog(log, caller, deployer) {
  log.event.should.be.eq('DeployAuthorized')
  log.args._caller.should.be.equal(caller)
  log.args._deployer.should.be.equal(deployer)
}

function checkDeployForbiddenLog(log, caller, deployer) {
  log.event.should.be.eq('DeployForbidden')
  log.args._caller.should.be.equal(caller)
  log.args._deployer.should.be.equal(deployer)
}

contract('SPACERegistry', accounts => {
  const [creator, user, anotherUser, operator, hacker] = accounts

  let contracts = null
  let sector = null
  let space = null

  const creationParams = {
    gas: 7e6,
    gasPrice: 1e9,
    from: creator
  }
  const sentByUser = { ...creationParams, from: user }
  const sentByCreator = { ...creationParams, from: creator }
  const sentByOperator = { ...creationParams, from: operator }
  const sentByAnotherUser = { ...creationParams, from: anotherUser }
  const sentByHacker = { ...creationParams, from: hacker }

  async function createSector(xs, ys, owner, sendParams) {
    return createSectorFull(contracts, xs, ys, owner, '', sendParams)
  }

  async function getSpaceOfUser() {
    const [xUser, yUser] = await space.spaceOf(user)
    xUser[0].should.be.bignumber.equal(0)
    xUser[1].should.be.bignumber.equal(0)
    yUser[0].should.be.bignumber.equal(1)
    yUser[1].should.be.bignumber.equal(2)
    return [xUser, yUser]
  }

  beforeEach(async function() {
    contracts = await setupContracts(creator, creationParams)
    sector = contracts.sector
    space = contracts.space

    await space.authorizeDeploy(creator, sentByCreator)
    await space.assignNewParcel(0, 1, user, sentByCreator)
    await space.assignNewParcel(0, 2, user, sentByCreator)
    await space.ping(sentByUser)
  })

  describe('name', function() {
    it('has a name', async function() {
      const name = await space.name()
      name.should.be.equal(SPACE_NAME)
    })
  })

  describe('symbol', function() {
    it('has a symbol', async function() {
      const symbol = await space.symbol()
      symbol.should.be.equal(SPACE_SYMBOL)
    })
  })

  describe('totalSupply', function() {
    it('has a total supply equivalent to the inital supply', async function() {
      const totalSupply = await space.totalSupply()
      totalSupply.should.be.bignumber.equal(2)
    })
    it('has a total supply that increases after creating a new SPACE', async function() {
      let totalSupply = await space.totalSupply()
      totalSupply.should.be.bignumber.equal(2)
      await space.assignNewParcel(-123, 3423, anotherUser, sentByCreator)
      totalSupply = await space.totalSupply()
      totalSupply.should.be.bignumber.equal(3)
    })
  })

  describe('new parcel assignment,', function() {
    describe('one at a time:', function() {
      it('only allows the creator to assign parcels', async function() {
        await assertRevert(
          space.assignNewParcel(1, 2, user, { from: anotherUser })
        )
      })

      it('allows the creator to assign parcels', async function() {
        await space.assignNewParcel(1, 1, user, sentByCreator)
        const owner = await space.ownerOfSpace(1, 1)
        owner.should.be.equal(user)
      })
    })

    describe('multiple', function() {
      describe('successfully registers 10 parcels', async function() {
        const x = []
        const y = []
        const limit = 10
        for (let i = 4; x.length < limit; i *= -2) {
          x.push(i)
        }
        for (let j = -3; y.length < x.length; j *= -3) {
          y.push(j)
        }
        let assetIds

        before(async function() {
          await space.assignMultipleParcels(x, y, anotherUser, sentByCreator)
          assetIds = await space.tokensOf(anotherUser)
        })

        for (let i = 0; i < x.length; i++) {
          it(
            `works for ${x[i]},${y[i]}`,
            (i => async () => {
              const registeredId = await space.encodeTokenId(x[i], y[i])
              registeredId.should.bignumber.equal(assetIds[i])
            })(i)
          )
        }
      })
    })
  })

  describe('tokenId', function() {
    const values = [
      {
        x: 0,
        y: 0,
        encoded:
          '0x0000000000000000000000000000000000000000000000000000000000000000'
      },
      {
        x: 0,
        y: 1,
        encoded:
          '0x0000000000000000000000000000000000000000000000000000000000000001'
      },
      {
        x: 1,
        y: 0,
        encoded:
          '0x0000000000000000000000000000000100000000000000000000000000000000'
      },
      {
        x: 0,
        y: -1,
        encoded:
          '0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff'
      },
      {
        x: -1,
        y: -1,
        encoded:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      },
      {
        x: 0,
        y: 256,
        encoded:
          '0x0000000000000000000000000000000000000000000000000000000000000100'
      },
      {
        x: -256,
        y: 0,
        encoded:
          '0xffffffffffffffffffffffffffffff0000000000000000000000000000000000'
      },
      {
        x: -23,
        y: -23,
        encoded:
          '0xffffffffffffffffffffffffffffffe9ffffffffffffffffffffffffffffffe9'
      }
    ]

    describe('encodeTokenId', function() {
      const encodeFn = value =>
        async function() {
          const encoded = new BigNumber(value.encoded)
          const result = await space.encodeTokenId(value.x, value.y)
          result.should.bignumber.equal(encoded)
        }
      for (let value of values) {
        it(`correctly encodes ${value.x},${value.y}`, encodeFn(value))
      }
    })

    describe('decodeTokenId', function() {
      const decodeFn = value =>
        async function() {
          const encoded = new BigNumber(value.encoded)
          const result = await space.decodeTokenId(encoded)

          const [x, y] = result

          x.should.bignumber.equal(value.x)
          y.should.bignumber.equal(value.y)
        }
      for (let value of values) {
        it(`correctly decodes ${value.encoded}`, decodeFn(value))
      }
    })
  })

  describe('getters', function() {
    describe('ownerOfSpace', function() {
      it('gets the owner of a parcel of SPACE', async function() {
        const owner = await space.ownerOfSpace(0, 1)
        owner.should.be.equal(user)
      })
    })

    describe('ownerOfSpaceMany', function() {
      it('gets the address of owners for a list of parcels', async function() {
        await space.assignNewParcel(0, 3, anotherUser, sentByCreator)
        const owners = await space.ownerOfSpaceMany([0, 0, 0], [1, 2, 3])
        owners[0].should.be.equal(user)
        owners[1].should.be.equal(user)
        owners[2].should.be.equal(anotherUser)
      })
    })

    describe('spaceOf', function() {
      it('gets the parcel coordinates for a certain owner', async function() {
        const [x, y] = await space.spaceOf(user)
        x[0].should.be.bignumber.equal(0)
        x[1].should.be.bignumber.equal(0)
        y[0].should.be.bignumber.equal(1)
        y[1].should.be.bignumber.equal(2)
      })
    })

    describe('exists', function() {
      it('returns true if the parcel has been assigned', async function() {
        const exists = await space.existsProxy(0, 1) // Truffle still fails to correctly handle function overloading
        exists.should.be.true
      })

      it('returns false if the has not been assigned', async function() {
        const exists = await space.existsProxy(1, 1)
        exists.should.be.false
      })

      it('throws if invalid coordinates are provided', async function() {
        return Promise.all([space.existsProxy('a', 'b').should.be.rejected])
      })

      it('throws if no coordinates are provided', async function() {
        return Promise.all([space.existsProxy().should.be.rejected])
      })
    })

    describe('spaceData', function() {
      it('returns an empty string for a freshly-assigned parcel', async function() {
        const data = await space.spaceData(0, 1)
        data.should.be.equal('')
      })

      it('allows updating your own SPACE data', async function() {
        await space.updateSpaceData(0, 1, 'test_data', sentByUser)
        const data = await space.spaceData(0, 1, sentByUser)
        data.should.be.equal('test_data')
      })

      it('throws if updating another user SPACE data', async function() {
        await assertRevert(
          space.updateSpaceData(0, 1, 'test_data', sentByCreator)
        )
      })

      it('allow updating SPACE data if given authorization', async function() {
        await space.setUpdateOperator(1, creator, sentByUser)
        await space.updateSpaceData(0, 1, 'test_data', sentByCreator)
      })

      it('returns SPACE data for a parcel that belongs to another holder', async function() {
        const tokenId = await space.encodeTokenId(1, 1)
        await space.assignNewParcel(1, 1, creator, sentByCreator)
        await space.setUpdateOperator(tokenId, user, sentByCreator)
        await space.updateSpaceData(1, 1, 'test_data', sentByUser)
        const data = await space.spaceData(1, 1, sentByCreator) // user queries creator's space
        data.should.be.equal('test_data')
      })

      it('returns an empty string for a set of coordidnates with no associated parcel', async function() {
        const data = await space.spaceData(14, 13)
        data.should.be.equal('')
      })

      it('throws if invalid coordinates are provided', async function() {
        return Promise.all([space.spaceData('a', 'b').should.be.rejected])
      })

      it('throws if no coordinates are provided', async function() {
        return Promise.all([space.spaceData().should.be.rejected])
      })
    })

    describe('updateSpaceData', function() {
      it('updates the parcel data if authorized :: operator', async function() {
        await space.approve(operator, 1, sentByUser)
        const originalData = await space.spaceData(0, 1, sentByUser)
        originalData.should.be.equal('')
        await space.updateSpaceData(0, 1, 'test_data', sentByOperator)
        const data = await space.spaceData(0, 1, sentByUser)
        data.should.be.equal('test_data')
      })

      it('updates the parcel data if authorized :: approve for all', async function() {
        await space.setApprovalForAll(operator, true, sentByUser)
        const originalData = await space.spaceData(0, 1, sentByUser)
        originalData.should.be.equal('')
        await space.updateSpaceData(0, 1, 'test_data', sentByOperator)
        const data = await space.spaceData(0, 1, sentByUser)
        data.should.be.equal('test_data')
      })

      it('updates the parcel data if authorized :: update operator', async function() {
        await space.setUpdateOperator(1, operator, sentByUser)
        const originalData = await space.spaceData(0, 1, sentByUser)
        originalData.should.be.equal('')
        await space.updateSpaceData(0, 1, 'test_data', sentByOperator)
        const data = await space.spaceData(0, 1, sentByUser)
        data.should.be.equal('test_data')
      })

      it('sets an empty string if invalid data is provided', async function() {
        await space.setUpdateOperator(1, user, sentByUser)

        const originalData = await space.spaceData(0, 1, sentByUser)
        originalData.should.be.equal('')

        await space.updateSpaceData(0, 1, 'test-data', sentByUser)
        const intermediateData = await space.spaceData(0, 1, sentByUser)
        intermediateData.should.be.equal('test-data')

        await space.updateSpaceData(0, 1, 999, sentByUser)
        const finalData = await space.spaceData(0, 1, sentByUser)
        finalData.should.be.equal('')
      })

      it('reverts if the sender is not an authorized operator', async function() {
        await assertRevert(
          space.updateSpaceData(1, 1, 'test_data', sentByCreator)
        )
      })

      it('emits Update event on SPACE update', async function() {
        const data = 'test_data'
        const { logs } = await space.updateSpaceData(0, 1, data, sentByUser)

        // Event emitted
        const assetId = await space.encodeTokenId(0, 1)
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('Update')
        log.args.assetId.should.be.bignumber.equal(assetId)
        log.args.holder.should.be.equal(user)
        log.args.operator.should.be.equal(user)
        log.args.data.should.be.equal(data)
      })
    })

    describe('authorizeDeploy', function() {
      it('authorizes an address', async function() {
        await space.authorizeDeploy(user)
        const isAuthorized = await space.isDeploymentAuthorized(user)
        isAuthorized.should.be.true
      })

      it('verifies that deployments are not authorized by default', async function() {
        const isAuthorized = await space.isDeploymentAuthorized(user)
        isAuthorized.should.be.false
      })

      it('reverts if address is already authorized ', async function() {
        await space.authorizeDeploy(user, sentByCreator)
        await assertRevert(space.authorizeDeploy(user, sentByCreator))
      })

      it('reverts if authorizing invalid address', async function() {
        await assertRevert(space.authorizeDeploy(NONE, sentByCreator))
      })

      it('reverts if the sender is not the owner', async function() {
        await assertRevert(space.authorizeDeploy(user, sentByUser))
      })

      it('should use proxy owner to validate deploy call', async function() {
        await space.initialize(hacker, { from: hacker })
        await assertRevert(space.authorizeDeploy(hacker, { from: hacker }))
      })

      it('should use proxy owner to validate forbid call', async function() {
        await space.initialize(hacker, { from: hacker })
        await assertRevert(space.forbidDeploy(hacker, { from: hacker }))
      })

      it('reverts if user tries to assign SPACE and it not deployer', async function() {
        await assertRevert(space.assignNewParcel(1, 0, anotherUser, sentByUser))
      })

      it('deployer must be able to assign new SPACE', async function() {
        await space.authorizeDeploy(user, sentByCreator)
        await space.assignNewParcel(1, 0, anotherUser, sentByUser)
        const owner = await space.ownerOfSpace(1, 0)
        owner.should.be.equal(anotherUser)
      })

      it('emits DeployAuthorized event', async function() {
        const { logs } = await space.authorizeDeploy(user, sentByCreator)
        logs.length.should.be.equal(1)
        checkDeployAuthorizedLog(logs[0], creator, user)
      })
    })

    describe('forbidDeploy', function() {
      it('reverts if address is already forbidden', async function() {
        await assertRevert(space.forbidDeploy(user, sentByCreator))
      })

      it('forbids the deployment for an specific address after authorization', async function() {
        await space.authorizeDeploy(user)
        const isAuthorized = await space.isDeploymentAuthorized(user)
        isAuthorized.should.be.true

        await space.forbidDeploy(user)
        const isAuthorizedFinal = await space.isDeploymentAuthorized(user)
        isAuthorizedFinal.should.be.false
      })

      it('reverts if the sender is not the owner', async function() {
        await assertRevert(space.forbidDeploy(user, sentByUser))
      })

      it('reverts if deauthorize invalid address', async function() {
        await assertRevert(space.forbidDeploy(NONE, sentByCreator))
      })

      it('emits DeployForbidden event', async function() {
        await space.authorizeDeploy(user, sentByCreator)
        const { logs } = await space.forbidDeploy(user, sentByCreator)
        logs.length.should.be.equal(1)
        checkDeployForbiddenLog(logs[0], creator, user)
      })
    })
  })

  describe('Transfers', function() {
    describe('transfer from', function() {
      it('does not transfer SPACE if the destinatary is the SectorRegistry', async function() {
        const spaceId = await space.encodeTokenId(0, 1)
        await assertRevert(
          space.transferFrom(user, sector.address, spaceId, sentByUser)
        )
      })
    })

    describe('transferSpace', function() {
      it('transfers SPACE if it is called by owner', async function() {
        await space.transferSpace(0, 1, creator, sentByUser)
        const [xCreator, yCreator] = await space.spaceOf(creator)
        const [xNewUser, yNewUser] = await space.spaceOf(user)

        xCreator[0].should.be.bignumber.equal(0)
        yCreator[0].should.be.bignumber.equal(1)
        xCreator.length.should.be.equal(1)
        yCreator.length.should.be.equal(1)

        xNewUser[0].should.be.bignumber.equal(0)
        yNewUser[0].should.be.bignumber.equal(2)
        xNewUser.length.should.be.equal(1)
        yNewUser.length.should.be.equal(1)
      })

      it('transfers SPACE if it is called by operator', async function() {
        await space.setApprovalForAll(operator, true, sentByUser)
        await space.transferSpace(0, 1, creator, sentByOperator)
        const [xCreator, yCreator] = await space.spaceOf(creator)
        const [xNewUser, yNewUser] = await space.spaceOf(user)

        xCreator[0].should.be.bignumber.equal(0)
        yCreator[0].should.be.bignumber.equal(1)
        xCreator.length.should.be.equal(1)
        yCreator.length.should.be.equal(1)

        xNewUser[0].should.be.bignumber.equal(0)
        yNewUser[0].should.be.bignumber.equal(2)
        xNewUser.length.should.be.equal(1)
        yNewUser.length.should.be.equal(1)
      })

      it('does not transfer SPACE if it is called by not authorized operator', async function() {
        await assertRevert(space.transferSpace(0, 1, creator, sentByOperator))
      })

      it('does not transfer SPACE if space does not exist', async function() {
        await assertRevert(space.transferSpace(1, 1, creator, sentByUser))
      })
    })

    describe('transferManySpace', function() {
      it('transfers SPACEs if it is called by owner', async function() {
        const [xUser, yUser] = await getSpaceOfUser()

        await space.transferManySpace(xUser, yUser, creator, sentByUser)
        const [xCreator, yCreator] = await space.spaceOf(creator)
        const [xNewUser, yNewUser] = await space.spaceOf(user)

        xCreator[0].should.be.bignumber.equal(0)
        xCreator[1].should.be.bignumber.equal(0)
        yCreator[0].should.be.bignumber.equal(1)
        yCreator[1].should.be.bignumber.equal(2)
        xCreator.length.should.be.equal(2)
        yCreator.length.should.be.equal(2)

        xNewUser.length.should.be.equal(0)
        yNewUser.length.should.be.equal(0)
      })

      it('transfers SPACEs if it is called by operator', async function() {
        const [xUser, yUser] = await getSpaceOfUser()

        await space.setApprovalForAll(operator, true, sentByUser)
        await space.transferManySpace(xUser, yUser, creator, sentByOperator)
        const [xCreator, yCreator] = await space.spaceOf(creator)
        const [xNewUser, yNewUser] = await space.spaceOf(user)

        xCreator[0].should.be.bignumber.equal(0)
        xCreator[1].should.be.bignumber.equal(0)
        yCreator[0].should.be.bignumber.equal(1)
        yCreator[1].should.be.bignumber.equal(2)
        xCreator.length.should.be.equal(2)
        yCreator.length.should.be.equal(2)

        xNewUser.length.should.be.equal(0)
        yNewUser.length.should.be.equal(0)
      })

      it('does not transfer SPACEs if it is called by not authorized operator', async function() {
        const [xUser, yUser] = await space.spaceOf(user)
        await assertRevert(
          space.transferManySpace(xUser, yUser, creator, sentByOperator)
        )
      })

      it('does not transfer SPACEs if space does not exist', async function() {
        await assertRevert(
          space.transferManySpace([12, 4], [1, 2], creator, sentByUser)
        )
      })

      it('does not transfer SPACEs if x length is not equal to y length', async function() {
        await assertRevert(
          space.transferManySpace([0, 0], [0, 1, 3], creator, sentByUser)
        )
      })
    })
  })

  describe('transfer SPACE to sector', function() {
    let sectorId

    beforeEach(async function() {
      await space.assignMultipleParcels([3], [3], creator, sentByCreator)
      sectorId = await createSector([3], [3], user, sentByCreator)
    })

    describe('transferSpaceToSector', function() {
      it('should not transfer the SPACE to an Sector if it not is owned by the sender', async function() {
        await space.assignMultipleParcels([4], [4], operator, sentByCreator)
        await assertRevert(
          space.transferSpaceToSector(4, 4, sectorId, sentByOperator)
        )
      })

      it('transfers SPACE to an Sector if it is called by owner', async function() {
        await space.transferSpaceToSector(0, 1, sectorId, sentByUser)

        const [xSector, ySector] = await space.spaceOf(sector.address)
        const [xNewUser, yNewUser] = await space.spaceOf(user)

        xSector[0].should.be.bignumber.equal(3)
        xSector[1].should.be.bignumber.equal(0)
        ySector[0].should.be.bignumber.equal(3)
        ySector[1].should.be.bignumber.equal(1)
        xSector.length.should.be.equal(2)
        ySector.length.should.be.equal(2)

        xNewUser[0].should.be.bignumber.equal(0)
        yNewUser[0].should.be.bignumber.equal(2)
        xNewUser.length.should.be.equal(1)
        yNewUser.length.should.be.equal(1)
      })

      it('does not transfer SPACE if it is called by not authorized operator', async function() {
        await assertRevert(
          space.transferSpaceToSector(0, 1, sectorId, sentByOperator)
        )
      })

      it('does not transfer SPACE if SPACE does not exist', async function() {
        await assertRevert(
          space.transferSpaceToSector(1, 1, sectorId, sentByUser)
        )
      })
    })

    describe('transferManySpaceToSector', function() {
      it('should not transfer the SPACEs to an Sector if it is not owned by the sender', async function() {
        await space.assignMultipleParcels([4], [4], operator, sentByCreator)
        await assertRevert(
          space.transferManySpaceToSector([4], [4], sectorId, sentByOperator)
        )
      })

      it('transfers SPACEs if it is called by owner', async function() {
        const [xUser, yUser] = await getSpaceOfUser()

        await space.transferManySpaceToSector(xUser, yUser, sectorId, sentByUser)

        const [xSector, ySector] = await space.spaceOf(sector.address)
        const [xNewUser, yNewUser] = await space.spaceOf(user)

        xSector[0].should.be.bignumber.equal(3)
        xSector[1].should.be.bignumber.equal(0)
        xSector[2].should.be.bignumber.equal(0)
        ySector[0].should.be.bignumber.equal(3)
        ySector[1].should.be.bignumber.equal(1)
        ySector[2].should.be.bignumber.equal(2)
        xSector.length.should.be.equal(3)
        ySector.length.should.be.equal(3)

        xNewUser.length.should.be.equal(0)
        yNewUser.length.should.be.equal(0)
      })

      it('does not transfer SPACEs if it is called by not authorized operator', async function() {
        const [xUser, yUser] = await space.spaceOf(user)
        await assertRevert(
          space.transferManySpaceToSector(xUser, yUser, sectorId, {
            from: operator
          })
        )
      })

      it('does not transfer SPACEs if space does not exist', async function() {
        await assertRevert(
          space.transferManySpaceToSector([12, 4], [1, 2], sectorId, sentByUser)
        )
      })

      it('does not transfer SPACEs if x length is not equal to y length', async function() {
        await assertRevert(
          space.transferManySpaceToSector([0, 0], [0, 1, 3], sectorId, sentByUser)
        )
      })
    })
  })

  describe('update authorized', function() {
    it('update not allowed before setUpdateOperator', async function() {
      await assertRevert(space.updateSpaceData(0, 1, '', sentByOperator))
    })

    it('update allowed after setUpdateOperator', async function() {
      const spaceId = await space.encodeTokenId(0, 1)
      await space.setUpdateOperator(spaceId, operator, sentByUser)
      await space.updateSpaceData(0, 1, 'newValue', sentByOperator)
      const data = await space.spaceData(0, 1)
      data.should.be.equal('newValue')
    })

    it('update disallowed after setUpdateOperator to different address', async function() {
      const spaceId = await space.encodeTokenId(0, 1)
      await space.setUpdateOperator(spaceId, operator, sentByUser)
      await space.setUpdateOperator(spaceId, anotherUser, sentByUser)
      await assertRevert(space.updateSpaceData(0, 1, 'newValue', sentByOperator))
    })

    it('update disallowed after transfer', async function() {
      const spaceId = await space.encodeTokenId(0, 1)
      await space.setUpdateOperator(spaceId, operator, sentByUser)
      await space.safeTransferFrom(user, anotherUser, spaceId, sentByUser)
      await assertRevert(space.updateSpaceData(0, 1, 'newValue', sentByOperator))
    })

    it('update operator emits UpdateOperator event', async function() {
      const assetId = await space.encodeTokenId(0, 1)
      const { logs } = await space.setUpdateOperator(
        assetId,
        operator,
        sentByUser
      )

      // Event emitted
      logs.length.should.be.equal(1)

      const log = logs[0]
      log.event.should.be.eq('UpdateOperator')
      log.args.assetId.should.be.bignumber.equal(assetId)
      log.args.operator.should.be.equal(operator)
    })

    it('should set an update operator by an operator', async function() {
      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      await space.approve(operator, 1, sentByUser)
      await space.setUpdateOperator(1, anotherUser, sentByOperator)
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set an update operator by an operator approved for all', async function() {
      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      await space.setApprovalForAll(operator, true, sentByUser)
      await space.setUpdateOperator(1, anotherUser, sentByOperator)
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set an update operator by updateManager', async function() {
      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)

      await space.setUpdateManager(user, operator, true, sentByUser)
      await space.setUpdateOperator(1, anotherUser, sentByOperator)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
    })

    it('reverts if not owner want to update the update operator', async function() {
      await assertRevert(
        space.setUpdateOperator(1, anotherUser, sentByAnotherUser)
      )
      await assertRevert(space.setUpdateOperator(1, anotherUser, sentByHacker))
    })

    it('should be clear on transfer :: transferFrom', async function() {
      const spaceId = await space.encodeTokenId(0, 1)

      let owner = await space.ownerOf(spaceId)
      owner.should.be.equal(user)

      await space.setUpdateOperator(spaceId, operator, sentByUser)

      let updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(operator)

      await space.transferFrom(user, anotherUser, spaceId, sentByUser)

      updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(NONE)

      owner = await space.ownerOf(spaceId)
      owner.should.be.equal(anotherUser)
    })

    it('should be clear on transfer :: safeTransferFrom', async function() {
      const spaceId = await space.encodeTokenId(0, 1)

      let owner = await space.ownerOf(spaceId)
      owner.should.be.equal(user)

      await space.setUpdateOperator(spaceId, operator, sentByUser)

      let updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(operator)

      await space.safeTransferFrom(user, anotherUser, spaceId, sentByUser)

      updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(NONE)

      owner = await space.ownerOf(spaceId)
      owner.should.be.equal(anotherUser)
    })

    it('should be clear on transfer :: transferSpace', async function() {
      const spaceId = await space.encodeTokenId(0, 1)

      let owner = await space.ownerOf(spaceId)
      owner.should.be.equal(user)

      await space.setUpdateOperator(spaceId, operator, sentByUser)

      let updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(operator)

      await space.transferSpace(0, 1, anotherUser, sentByUser)

      updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(NONE)

      owner = await space.ownerOf(spaceId)
      owner.should.be.equal(anotherUser)
    })

    it('should be clear on transfer :: transferManySpace', async function() {
      const [xUser, yUser] = await getSpaceOfUser()

      let owner = await space.ownerOf(1)
      owner.should.be.equal(user)

      owner = await space.ownerOf(2)
      owner.should.be.equal(user)

      await space.setUpdateOperator(1, operator, sentByUser)
      await space.setUpdateOperator(2, operator, sentByUser)

      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(operator)

      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(operator)

      await space.transferManySpace(xUser, yUser, anotherUser, sentByUser)
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)

      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)

      owner = await space.ownerOf(1)
      owner.should.be.equal(anotherUser)

      owner = await space.ownerOf(2)
      owner.should.be.equal(anotherUser)
    })

    it('should be clear on transfer :: transferSpaceToSector', async function() {
      const spaceId = await space.encodeTokenId(0, 1)

      let owner = await space.ownerOf(spaceId)
      owner.should.be.equal(user)

      await space.assignMultipleParcels([3], [3], creator, sentByCreator)
      const sectorId = await createSector([3], [3], user, sentByCreator)

      await space.setUpdateOperator(spaceId, operator, sentByUser)

      let updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(operator)

      await space.transferSpaceToSector(0, 1, sectorId, sentByUser)

      updateOperator = await space.updateOperator(spaceId)
      updateOperator.should.be.equal(NONE)

      owner = await space.ownerOf(spaceId)
      owner.should.be.equal(sector.address)
    })

    it('should be clear on transfer :: transferManySpaceToSector', async function() {
      let owner = await space.ownerOf(1)
      owner.should.be.equal(user)

      owner = await space.ownerOf(2)
      owner.should.be.equal(user)

      await space.assignMultipleParcels([3], [3], creator, sentByCreator)
      const sectorId = await createSector([3], [3], user, sentByCreator)

      const [xUser, yUser] = await getSpaceOfUser()

      await space.setUpdateOperator(1, operator, sentByUser)
      await space.setUpdateOperator(2, operator, sentByUser)

      let updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(operator)

      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(operator)

      await space.transferManySpaceToSector(xUser, yUser, sectorId, sentByUser)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)

      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)

      owner = await space.ownerOf(1)
      owner.should.be.equal(sector.address)

      owner = await space.ownerOf(2)
      owner.should.be.equal(sector.address)
    })
  })

  describe('UpdateManager', function() {
    it('should set updateManager by owner', async function() {
      const { logs } = await space.setUpdateManager(
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

      let isUpdateManager = await space.updateManager(user, operator)
      isUpdateManager.should.be.equal(true)

      await space.setUpdateManager(user, operator, false, sentByUser)
      isUpdateManager = await space.updateManager(user, operator)
      isUpdateManager.should.be.equal(false)
    })

    it('should set updateManager by approvedForAll', async function() {
      await space.setApprovalForAll(anotherUser, true, sentByUser)

      const { logs } = await space.setUpdateManager(
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

      let isUpdateManager = await space.updateManager(user, operator)
      isUpdateManager.should.be.equal(true)

      await space.setUpdateManager(user, operator, false, sentByAnotherUser)
      isUpdateManager = await space.updateManager(user, operator)
      isUpdateManager.should.be.equal(false)
    })

    it('should allow updateManager to update content', async function() {
      let data = await space.spaceData(0, 1)
      data.should.be.equal('')
      data = await space.spaceData(0, 2)
      data.should.be.equal('')

      await space.setUpdateManager(user, operator, true, sentByUser)

      await space.updateSpaceData(0, 1, 'newValue', sentByOperator)
      await space.updateSpaceData(0, 2, 'newValue', sentByOperator)

      data = await space.spaceData(0, 1)
      data.should.be.equal('newValue')
      data = await space.spaceData(0, 2)
      data.should.be.equal('newValue')
    })

    it('should allow updateManager to update content on new SPACEs', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)

      await space.assignNewParcel(0, 3, user, sentByCreator)

      let data = await space.spaceData(0, 3)
      data.should.be.equal('')

      await space.updateSpaceData(0, 3, 'newValue', sentByOperator)

      data = await space.spaceData(0, 3)
      data.should.be.equal('newValue')
    })

    it('should has false as default value for updateManager', async function() {
      const isUpdateManager = await space.updateManager(user, operator)
      isUpdateManager.should.be.equal(false)
    })

    it('should set multiple updateManager', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)
      await space.setUpdateManager(user, anotherUser, true, sentByUser)

      let isUpdateManager = await space.updateManager(user, operator)
      isUpdateManager.should.be.equal(true)

      isUpdateManager = await space.updateManager(user, anotherUser)
      isUpdateManager.should.be.equal(true)
    })

    it('clears updateManager correctly ', async function() {
      let data = await space.spaceData(0, 1)
      data.should.be.equal('')

      await space.setUpdateManager(user, operator, true, sentByUser)

      await space.updateSpaceData(0, 1, 'newValue', sentByOperator)

      data = await space.spaceData(0, 1)
      data.should.be.equal('newValue')

      await space.setUpdateManager(user, operator, false, sentByUser)

      await assertRevert(space.updateSpaceData(0, 1, 'again', sentByOperator))
    })

    it('reverts when updateManager trying to change content of no owned by the owner SPACE', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)

      await space.transferSpace(0, 1, anotherUser, sentByUser)

      let data = await space.spaceData(0, 2)
      data.should.be.equal('')

      await space.updateSpaceData(0, 2, 'newValue', sentByOperator)
      data = await space.spaceData(0, 2)
      data.should.be.equal('newValue')

      await assertRevert(space.updateSpaceData(0, 1, 'newValue', sentByOperator))
    })

    it('reverts if owner set himself as updateManager', async function() {
      await assertRevert(space.setUpdateManager(user, user, true, sentByUser))
    })

    it('reverts if not owner or approvedForAll set updateManager', async function() {
      // Not owner
      await assertRevert(
        space.setUpdateManager(user, operator, true, sentByAnotherUser)
      )

      // Hacker
      await assertRevert(
        space.setUpdateManager(user, operator, true, sentByHacker)
      )

      // Operator
      await space.approve(operator, 1, sentByUser)
      await assertRevert(
        space.setUpdateManager(user, operator, true, sentByOperator)
      )

      // Update Operator
      await space.setUpdateOperator(1, anotherUser, sentByUser)
      await assertRevert(
        space.setUpdateManager(user, operator, true, sentByAnotherUser)
      )
    })

    it('reverts when updateManager trying to transfer', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(space.transferSpace(0, 1, anotherUser, sentByOperator))
    })

    it('reverts when updateManager trying to set updateManager', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(
        space.setUpdateManager(user, anotherUser, 1, sentByOperator)
      )
    })

    it('reverts when updateManager trying to set operator', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(space.approve(anotherUser, 1, sentByOperator))
    })

    it('reverts when updateManager trying to set create an Sector', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(space.createSector([0], [1], user, sentByOperator))
    })

    it('reverts when updateManager trying to assign SPACEs', async function() {
      await space.setUpdateManager(user, operator, true, sentByUser)
      await assertRevert(space.assignNewParcel(0, 3, user, sentByOperator))
    })
  })

  describe('setManyUpdateOperator', function() {
    let updateOperator

    it('should set update operator', async function() {
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)

      await space.setManyUpdateOperator([1], anotherUser, sentByUser)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set many update operator :: owner', async function() {
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)

      await space.setManyUpdateOperator([1, 2], anotherUser, sentByUser)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set many update operator :: approvedForAll', async function() {
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)

      await space.setApprovalForAll(operator, true, sentByUser)

      await space.setManyUpdateOperator([1, 2], anotherUser, sentByOperator)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set many update operator :: operator', async function() {
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)

      await space.approve(operator, 1, sentByUser)
      await space.approve(operator, 2, sentByUser)
      await space.setManyUpdateOperator([1, 2], anotherUser, sentByOperator)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should set many update operator :: updateManager', async function() {
      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)

      await space.setUpdateManager(user, operator, true, sentByUser)
      await space.setManyUpdateOperator([1, 2], anotherUser, sentByOperator)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(anotherUser)
    })

    it('should clean many update operator', async function() {
      await space.setManyUpdateOperator([1, 2], anotherUser, sentByUser)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(anotherUser)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(anotherUser)

      await space.setManyUpdateOperator([1, 2], NONE, sentByUser)

      updateOperator = await space.updateOperator(1)
      updateOperator.should.be.equal(NONE)
      updateOperator = await space.updateOperator(2)
      updateOperator.should.be.equal(NONE)
    })

    it('reverts when updateOperator try to set many update operator', async function() {
      await space.setUpdateOperator(1, anotherUser, sentByUser)

      await assertRevert(
        space.setManyUpdateOperator([1], operator, sentByAnotherUser)
      )
    })

    it('reverts if not owner want to update the update operator', async function() {
      await assertRevert(
        space.setManyUpdateOperator([1], anotherUser, sentByAnotherUser)
      )
      await assertRevert(
        space.setManyUpdateOperator([1], anotherUser, sentByHacker)
      )
    })
  })

  describe('SpaceBalance', function() {
    let spaceBalance
    let sectorBalance

    async function getSpaceBalanceEvents(eventName) {
      return new Promise((resolve, reject) => {
        spaceBalance[eventName]().get(function(err, logs) {
          if (err) reject(new Error(`Error fetching the ${eventName} events`))
          resolve(logs)
        })
      })
    }

    beforeEach(async function() {
      spaceBalance = MiniMeToken.at(await space.spaceBalance())
      sectorBalance = MiniMeToken.at(await sector.sectorSpaceBalance())
    })

    describe('setBalanceToken', function() {
      it('should set balance token', async function() {
        const { logs } = await space.setSpaceBalanceToken(user, sentByCreator)

        // Event emitted
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('SetSpaceBalanceToken')
        log.args._previousSpaceBalance.should.be.equal(spaceBalance.address)
        log.args._newSpaceBalance.should.be.equal(user)
      })

      it('reverts if a hacker try to set balance token', async function() {
        await assertRevert(space.setSpaceBalanceToken(user, sentByHacker))
      })
    })

    describe('Register balance', function() {
      it('should register balance', async function() {
        const isRegistered = await space.registeredBalance(user)
        expect(isRegistered).equal(false)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        // Register
        await space.registerBalance(sentByUser)
        const logs = await getSpaceBalanceEvents('Transfer')
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('Transfer')
        log.args._from.should.be.equal(NONE)
        log.args._to.should.be.equal(user)
        log.args._amount.should.be.bignumber.equal(2)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)
      })

      it('should unregister balance', async function() {
        // Register
        await space.registerBalance(sentByUser)

        let isRegistered = await space.registeredBalance(user)
        expect(isRegistered).equal(true)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        // Unregister
        await space.unregisterBalance(sentByUser)

        const logs = await getSpaceBalanceEvents('Transfer')
        logs.length.should.be.equal(1)

        const log = logs[0]
        log.event.should.be.eq('Transfer')
        log.args._from.should.be.equal(user)
        log.args._to.should.be.equal(NONE)
        log.args._amount.should.be.bignumber.equal(2)

        isRegistered = await space.registeredBalance(user)
        expect(isRegistered).equal(false)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)
      })

      it('reverts re-register balance', async function() {
        await space.registerBalance(sentByAnotherUser)
        await assertRevert(space.registerBalance(sentByAnotherUser))
      })

      it('reverts re-unregister balance', async function() {
        await space.registerBalance(sentByAnotherUser)
        await space.unregisterBalance(sentByAnotherUser)
        await assertRevert(space.unregisterBalance(sentByAnotherUser))
      })
    })

    describe('Update balance', function() {
      beforeEach(async function() {
        await space.registerBalance(sentByUser)
      })

      it('should register balance only one balance', async function() {
        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        const spaceId = await space.encodeTokenId(0, 1)
        await space.transferFrom(user, anotherUser, spaceId, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(1)

        const isAnotherUserRegistered = await space.registeredBalance(
          anotherUser
        )
        expect(isAnotherUserRegistered).equal(false)

        const anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        let spaceRegistryBalance = await spaceBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)
      })

      it('should register owner balance if it was transferred by approval for all or operator', async function() {
        await space.setApprovalForAll(operator, true, sentByUser)
        await space.transferSpace(0, 1, creator, sentByOperator)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(1)

        let operatorBalance = await spaceBalance.balanceOf(operator)
        operatorBalance.should.be.bignumber.equal(0)

        let creatorBalance = await spaceBalance.balanceOf(creator)
        creatorBalance.should.be.bignumber.equal(0)

        await space.setApprovalForAll(operator, false, sentByUser)
        let spaceId = await space.encodeTokenId(0, 2)
        await space.approve(operator, spaceId, sentByUser)

        await space.transferSpace(0, 2, creator, sentByOperator)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        operatorBalance = await spaceBalance.balanceOf(operator)
        operatorBalance.should.be.bignumber.equal(0)

        creatorBalance = await spaceBalance.balanceOf(creator)
        creatorBalance.should.be.bignumber.equal(0)
      })

      it('should register balance both', async function() {
        await space.registerBalance(sentByAnotherUser)
        const isAnotherUserRegistered = await space.registeredBalance(
          anotherUser
        )
        expect(isAnotherUserRegistered).equal(true)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        let spaceId = await space.encodeTokenId(0, 1)
        await space.transferFrom(user, anotherUser, spaceId, sentByUser)

        spaceId = await space.encodeTokenId(0, 2)
        await space.transferFrom(user, anotherUser, spaceId, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        const anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(2)
      })

      it('should not register transfer to the sector registry', async function() {
        const isSectorRegistered = await space.registeredBalance(sector.address)
        expect(isSectorRegistered).equal(false)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        let userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(0)

        let sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        let spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        const sectorId = await createSector([0], [1], user, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(1)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(0)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await space.transferSpaceToSector(0, 2, sectorId, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(0)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await sector.registerBalance(sentByUser)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(2)
      })

      it('should register space balance and sector balance', async function() {
        await sector.registerBalance(sentByUser)

        let isSectorRegistered = await space.registeredBalance(sector.address)
        expect(isSectorRegistered).equal(false)

        let isSPACERegistered = await sector.registeredBalance(space.address)
        expect(isSPACERegistered).equal(false)

        let userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        let userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(0)

        let sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        let spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        const sectorId = await createSector([0], [1], user, sentByUser)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(1)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(1)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        await space.transferSpaceToSector(0, 2, sectorId, sentByUser)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(0)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(2)

        sectorRegistryBalance = await spaceBalance.balanceOf(sector.address)
        sectorRegistryBalance.should.be.bignumber.equal(0)

        spaceRegistryBalance = await sectorBalance.balanceOf(space.address)
        spaceRegistryBalance.should.be.bignumber.equal(0)

        let ownSpaceBalance = await spaceBalance.balanceOf(space.address)
        ownSpaceBalance.should.be.bignumber.equal(0)

        let ownSectorBalance = await sectorBalance.balanceOf(sector.address)
        ownSectorBalance.should.be.bignumber.equal(0)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(0)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(2)
      })

      it('should update on transfer :: transferFrom', async function() {
        const spaceId = await space.encodeTokenId(0, 1)

        await space.registerBalance(sentByAnotherUser)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        let anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await space.transferFrom(user, anotherUser, spaceId, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(1)

        anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(1)
      })

      it('should update on transfer :: safeTransferFrom', async function() {
        const spaceId = await space.encodeTokenId(0, 1)

        await space.registerBalance(sentByAnotherUser)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        let anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await space.safeTransferFrom(user, anotherUser, spaceId, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(1)

        anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(1)
      })

      it('should update on transfer :: transferSpace', async function() {
        await space.registerBalance(sentByAnotherUser)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        let anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await space.transferSpace(0, 1, anotherUser, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(1)

        anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(1)
      })

      it('should update on transfer :: transferManySpace', async function() {
        const [xUser, yUser] = await getSpaceOfUser()

        await space.registerBalance(sentByAnotherUser)

        let userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(2)

        let anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(0)

        await space.transferManySpace(xUser, yUser, anotherUser, sentByUser)

        userBalance = await spaceBalance.balanceOf(user)
        userBalance.should.be.bignumber.equal(0)

        anotherUserBalance = await spaceBalance.balanceOf(anotherUser)
        anotherUserBalance.should.be.bignumber.equal(2)
      })

      it('should update on transfer :: transferSpaceToSector', async function() {
        await space.registerBalance(sentByCreator)
        await sector.registerBalance(sentByUser)

        let userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        let userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(0)

        let creatorSpaceBalance = await spaceBalance.balanceOf(creator)
        creatorSpaceBalance.should.be.bignumber.equal(0)

        let creatorSectorBalance = await sectorBalance.balanceOf(creator)
        creatorSectorBalance.should.be.bignumber.equal(0)

        await space.assignMultipleParcels([3], [3], creator, sentByCreator)

        const sectorId = await createSector([3], [3], user, sentByCreator)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(1)

        creatorSpaceBalance = await spaceBalance.balanceOf(creator)
        creatorSpaceBalance.should.be.bignumber.equal(0)

        creatorSectorBalance = await sectorBalance.balanceOf(creator)
        creatorSectorBalance.should.be.bignumber.equal(0)

        await space.transferSpaceToSector(0, 1, sectorId, sentByUser)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(1)

        userSectorBalance = await sectorBalance.balanceOf(user)
        userSectorBalance.should.be.bignumber.equal(2)

        creatorSpaceBalance = await spaceBalance.balanceOf(creator)
        creatorSpaceBalance.should.be.bignumber.equal(0)

        creatorSectorBalance = await sectorBalance.balanceOf(creator)
        creatorSectorBalance.should.be.bignumber.equal(0)
      })

      it('should update on mint :: assignNewParcel', async function() {
        let userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        await space.assignNewParcel(3, 3, user, sentByCreator)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(3)
      })

      it('should update on mint :: assignMultipleParcels', async function() {
        let userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(2)

        await space.assignMultipleParcels([3, 4], [3, 4], user, sentByCreator)

        userSpaceBalance = await spaceBalance.balanceOf(user)
        userSpaceBalance.should.be.bignumber.equal(4)
      })
    })
  })
})
