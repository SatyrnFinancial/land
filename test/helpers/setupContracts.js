export const SECTOR_NAME = 'Sector'
export const SECTOR_SYMBOL = 'EST'

export const SPACE_NAME = 'Decentraspace SPACE'
export const SPACE_SYMBOL = 'SPACE'

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

export default async function setupContracts(creator) {
  const creationParams = {
    gas: 7e6,
    gasPrice: 1e9,
    from: creator
  }
  const sentByCreator = { ...creationParams, from: creator }

  const SPACERegistry = artifacts.require('SPACERegistryTest')
  const SectorRegistry = artifacts.require('SectorRegistryTest')
  const SPACEProxy = artifacts.require('SPACEProxy')
  const MiniMeToken = artifacts.require('MiniMeToken')

  const spaceMinimeToken = await MiniMeToken.new(
    EMPTY_ADDRESS,
    EMPTY_ADDRESS,
    0,
    SPACE_NAME,
    18,
    SPACE_SYMBOL,
    false,
    creationParams
  )
  const sectorMinimeToken = await MiniMeToken.new(
    EMPTY_ADDRESS,
    EMPTY_ADDRESS,
    0,
    SECTOR_NAME,
    18,
    SECTOR_SYMBOL,
    false,
    creationParams
  )

  const proxy = await SPACEProxy.new(creationParams)
  const registry = await SPACERegistry.new(creationParams)

  await proxy.upgrade(registry.address, creator, sentByCreator)

  const sector = await SectorRegistry.new(
    SECTOR_NAME,
    SECTOR_SYMBOL,
    proxy.address,
    creationParams
  )

  const space = await SPACERegistry.at(proxy.address)
  await space.initialize(creator, sentByCreator)
  await space.setSectorRegistry(sector.address)

  await spaceMinimeToken.changeController(space.address, sentByCreator)
  await space.setSpaceBalanceToken(spaceMinimeToken.address)

  await sectorMinimeToken.changeController(sector.address, sentByCreator)
  await sector.setSectorSpaceBalance(sectorMinimeToken.address)

  return {
    proxy,
    registry,
    sector,
    space
  }
}
