const utils = require('./utils')

const SPACETerraformSale = artifacts.require('../contracts/SPACETerraformSale.sol')

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const run = async () => {
  const filename = './ops/config.testnet.json'
  const input = utils.readJSON(filename)

  assert(input.TELESTOTokenAddress, 'Missing TELESTOToken address')
  assert(input.terraformReserveAddress, 'Missing TerraformReserve address')
  assert(input.returnVestingRegistryAddress, 'Missing ReturnVestingRegistry address')

  console.log(`Deploying contract: SPACETerraformSale`)
  console.log(`  TELESTOToken: ${input.TELESTOTokenAddress}`)
  console.log(`  TerraformReserve: ${input.terraformReserveAddress}`)
  console.log(`  ReturnVestingRegistry: ${input.returnVestingRegistryAddress}`)

  const sale = await SPACETerraformSale.new(
    input.TELESTOTokenAddress,
    input.terraformReserveAddress,
    input.returnVestingRegistryAddress,
    {gas: 4000000, gasPrice: 100e9}
  )
  console.log(`Deployed contract: ${sale.address}`)
}

const ret = (callback) => {
  run()
    .then(() => callback())
    .catch(console.log)
    .catch(callback)
}

module.exports = ret
