import assertRevert from './helpers/assertRevert'
const BigNumber = web3.BigNumber

const SPACERegistry = artifacts.require('SPACERegistry')
const SPACEProxy = artifacts.require('SPACEProxy')

function checkUpgradeLog(log, newContract, initializedWith) {
  log.event.should.be.eq('Upgrade')
  log.args.newContract.should.be.equal(newContract)
  log.args.initializedWith.should.be.equal(initializedWith)
}

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

contract('SPACEProxy', accounts => {
  const [creator, hacker, otherOwner] = accounts
  let registry = null
  let proxy = null
  let space = null

  const creationParams = {
    gas: 7e6,
    gasPrice: 21e9,
    from: creator
  }

  describe('upgrade', () => {
    beforeEach(async function() {
      proxy = await SPACEProxy.new(creationParams)
      registry = await SPACERegistry.new(creationParams)
      space = await SPACERegistry.at(proxy.address)
    })

    it('should upgrade proxy by owner', async () => {
      const { logs } = await proxy.upgrade(
        registry.address,
        creator,
        creationParams
      )
      await checkUpgradeLog(logs[0], registry.address, creator)

      const spaceName = await space.name()
      spaceName.should.be.equal('Decentraspace SPACE')

      const proxyOwner = await space.proxyOwner()
      proxyOwner.should.be.equal(creator)

      const ownerAddress = await space.owner()
      ownerAddress.should.be.equal(creator)
    })

    it('should throw if not owner upgrade proxy', async () => {
      await assertRevert(
        proxy.upgrade(
          registry.address,
          hacker,
          Object.assign({}, creationParams, { from: hacker })
        )
      )
    })

    it('should transfer ownership', async () => {
      await proxy.transferOwnership(otherOwner, { from: creator })
      const newOwner = await proxy.proxyOwner()
      newOwner.should.be.equal(otherOwner)
    })

    it('should throw if transfering to address 0x0', async () => {
      await assertRevert(proxy.transferOwnership(0x0, { from: creator }))
    })

    it('should throw if trying to transfer and not owner', async () => {
      await assertRevert(proxy.transferOwnership(otherOwner, { from: hacker }))
    })
  })
})
