const ScriptRunner = require('./ScriptRunner')
const { log, unlockWeb3Account, waitForTransaction } = require('./utils')
const { SPACERegistry, SectorRegistry } = require('./contractHelpers')
const addSpaceToSector = require('./addSpaceToSector').addSpaceToSector

const MAX_SPACE_PER_TX = 10
const REQUIRED_ARGS = ['account']

async function createSector(parcels, owner, data, options, contracts) {
  const { batchSize, retryFailedTxs } = options
  const { spaceRegistry, sectorRegistry, web3 } = contracts

  if (parcels.length > MAX_SPACE_PER_TX) {
    log.warn(
      `Got ${parcels.length} parcels but the max per tx is ${MAX_SPACE_PER_TX}`
    )
    log.warn(
      `The first transaction WILL DEPLOY ONLY the first ${MAX_SPACE_PER_TX} parcels`
    )
  }

  const firstParcelBatch = parcels.slice(0, MAX_SPACE_PER_TX)
  const hash = await spaceRegistry.createSector(firstParcelBatch, owner, data)
  log.info(`Created new Sector: ${hash}`)

  const transaction = await waitForTransaction(
    { hash, status: 'pending' },
    web3
  )

  if (transaction.status === 'failed') {
    if (retryFailedTxs != null) {
      log.info('Sector creation failed, retrying\n\n')
      return await createSector(parcels, owner, data, options, contracts)
    } else {
      log.info('Sector creation failed')
      return
    }
  }

  const sectorId = await sectorRegistry.getOwnerLastTokenId(owner)
  log.info(`Sector ${sectorId} created with ${parcels.length} parcels`)

  if (parcels.length > MAX_SPACE_PER_TX) {
    log.info(`Adding the other ${parcels.length - MAX_SPACE_PER_TX} parcles`)
    const restParcelBatch = parcels.slice(MAX_SPACE_PER_TX)
    await addSpaceToSector(
      restParcelBatch,
      sectorId,
      { batchSize },
      { spaceRegistry, sectorRegistry }
    )
  }
}

async function run(args, configuration) {
  const { account, password, owner, data, parcels } = args
  const { batchSize, retryFailedTxs } = args
  const { txConfig, contractAddresses } = configuration
  const {
    SPACERegistry: spaceRegistryAddress,
    SectorRegistry: sectorRegistryAddress
  } = contractAddresses

  spaceRegistry = new SPACERegistry(account, spaceRegistryAddress, txConfig)
  await spaceRegistry.setContract(artifacts)

  sectorRegistry = new SectorRegistry(account, sectorRegistryAddress, txConfig)
  await sectorRegistry.setContract(artifacts)

  await unlockWeb3Account(web3, account, password)

  await createSector(
    parcels,
    owner || account,
    data,
    { batchSize, retryFailedTxs },
    { spaceRegistry, sectorRegistry, web3 }
  )
}

const scriptRunner = new ScriptRunner({
  onHelp: () =>
    console.log(`Create a new Sector. To run, use:

truffle exec createSector.js --parcels genesis.json --account 0x --password 123 --owner 0x --network ropsten (...)

Available flags:

--parcels genesis.json          - List of parcels to add to the sector.
--account 0xdeadbeef            - Which account to use to deploy. Required
--password S0m3P4ss             - Password for the account.
--owner 0xdeadbeef              - The owner of the sector. If undefined, the account will be used
--data 'version,name,desc,ipns' - Sector metadata
--batchSize 50                  - Simultaneous space transactions. Default ${BATCH_SIZE}
--retryFailedTxs                - If this flag is present, the script will try to retry failed transactions
--logLevel debug                - Log level to use. Possible values: info, debug. Default: info

`),
  onRun: run
})

// This enables the script to be executed by `truffle exec` and to be exported
const runner = scriptRunner.getRunner(process.argv, REQUIRED_ARGS)
runner.createSector = createSector
module.exports = runner
