import assertRevert from './helpers/assertRevert'

const BigNumber = web3.BigNumber

const SPACERegistry = artifacts.require('SPACERegistryTest')
const SPACEProxy = artifacts.require('SPACEProxy')

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

contract('SPACERegistry', accounts => {
  const [creator, user, anotherUser] = accounts
  let registry = null
  let proxy = null
  let space = null

  const sentByUser = { from: user }
  const sentByCreator = { from: creator }
  const creationParams = {
    gas: 7e6,
    gasPrice: 21e9,
    from: creator
  }

  beforeEach(async function() {
    proxy = await SPACEProxy.new(creationParams)
    registry = await SPACERegistry.new(creationParams)

    await proxy.upgrade(registry.address, creator, sentByCreator)
    space = await SPACERegistry.at(proxy.address)
    await space.initialize(creator, sentByCreator)
    await space.authorizeDeploy(creator, sentByCreator)
    await space.ping(sentByUser)
  })

  async function assign({ to, asset, initialValue }) {
    await space.assignNewParcel(0, asset, to, sentByCreator)
    await space.updateSpaceData(0, asset, initialValue, { from: to })
  }

  async function transfer({ from, to, asset }) {
    await space.transferSpace(0, asset, to, { from })
  }

  async function update({ from, asset, value }) {
    await space.updateSpaceData(0, asset, value, { from })
  }

  const assetOne = 1
  const initialValue = 'initial'
  const newValue = 'new'

  describe('Combinations of calls', () => {
    it('before transfer, update is possible, after, it is not', async () => {
      await assign({ to: user, asset: assetOne, initialValue: initialValue })
      await update({ from: user, asset: assetOne, value: newValue })
      await transfer({ from: user, to: anotherUser, asset: assetOne })
      await assertRevert(
        update({ from: user, asset: assetOne, value: newValue })
      )
    })
    it('before owning, update is impossible, after, it is not', async () => {
      await assign({ to: user, asset: assetOne, initialValue: initialValue })
      await assertRevert(
        update({ from: anotherUser, asset: assetOne, value: newValue })
      )
      await transfer({ from: user, to: anotherUser, asset: assetOne })
      await update({ from: anotherUser, asset: assetOne, value: newValue })
    })
    /**
     * - Setup old contract and test upgrades
     * - Check for updates and
     */
  })
})
