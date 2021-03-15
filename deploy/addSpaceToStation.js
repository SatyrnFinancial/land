const ScriptRunner = require('./ScriptRunner')
const {
  log,
  unlockWeb3Account,
  getFailedTransactions,
  waitForTransaction
} = require('./utils')
const { SPACERegistry, SectorRegistry } = require('./contractHelpers')

const MAX_SPACE_PER_TX = 10
const BATCH_SIZE = 1
const REQUIRED_ARGS = ['account', 'sectorId', 'parcels']

async function addSpaceToSector(allParcels, sectorId, options, contracts) {
  let { batchSize, retryFailedTxs } = options
  const { spaceRegistry, sectorRegistry, web3 } = contracts

  const parcels = []
  let parcelsAdded = 0
  let runningTransactions = []
  let failedTransactions = []

  batchSize = batchSize || BATCH_SIZE

  log.info(`Checking the owner of the sector ${sectorId}`)
  const sectorOwner = await sectorRegistry.getCurrentOwner(sectorId)
  if (sectorOwner !== spaceRegistry.account) {
    throw new Error(
      `Owner "${sectorOwner}" of ${sectorId} isn't the current account`
    )
  }

  log.info(`Checking the owners of ${allParcels.length} parcels`)
  for (const parcel of allParcels) {
    log.debug(`Getting on chain owner for parcel ${parcel.x},${parcel.y},${parcel.z}`)

    const owner = await spaceRegistry.getCurrentOwner(parcel)
    if (owner === spaceRegistry.account) {
      parcels.push(parcel)
    } else {
      log.debug(
        `Owner "${owner}" of ${parcel.x},${parcel.y} isn't the current account`
      )
    }
  }
  log.info(`Assigning ${parcels.length}/${allParcels.length} parcels`)

  while (parcelsAdded < parcels.length) {
    const start = parcelsAdded
    const end = parcelsAdded + MAX_SPACE_PER_TX
    const parcelsToAdd = parcels.slice(start, end)

    log.debug(`Assigning parcels from ${start} to ${end}`)
    const hash = await spaceRegistry.transferManySpaceToSector(
      parcelsToAdd,
      sectorId
    )
    log.info(
      `Assigned ${parcelsToAdd.length} parcels to sector ${sectorId}: ${hash}`
    )

    runningTransactions.push({ hash, data: parcelsToAdd, status: 'pending' })

    if (runningTransactions.length >= batchSize) {
      failedTransactions = failedTransactions.concat(
        await getFailedTransactions(runningTransactions, web3)
      )
      runningTransactions = []
    }

    parcelsAdded += MAX_SPACE_PER_TX
  }

  if (runningTransactions.length > 0) {
    failedTransactions = failedTransactions.concat(
      await getFailedTransactions(runningTransactions, web3)
    )
  }

  if (failedTransactions.length === 0) {
    log.info('Nothing else to do')
    return
  } else {
    log.info('Waiting for transactions to end')
  }

  log.info(`Found ${failedTransactions.length} failed transactions`)

  if (failedTransactions.length > 0 && retryFailedTxs != null) {
    log.info(`Retrying ${failedTransactions.length} failed transactions\n\n`)
    const failedParcels = failedTransactions.reduce(
      (allParcels, tx) => allParcels.concat(tx.data),
      []
    )
    return await addSpaceToSector(parcels, sectorId, options, contracts)
  } else {
    log.info(`Failed transactions: ${failedTransactions.map(t => t.hash)}`)
  }
}

async function run(args, configuration) {
  const { account, password, sectorId, parcels } = args
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

  try {
    await addSpaceToSector(
      parcels,
      sectorId,
      { batchSize: +batchSize, retryFailedTxs },
      { spaceRegistry, sectorRegistry, web3 }
    )
  } catch (error) {
    log.error(
      'An error occurred trying to transfer the parcels. Check the `sectorId`!'
    )
    throw error
  }
}

const scriptRunner = new ScriptRunner({
  onHelp: () =>
    console.log(`Add SPACE to an already created Sector. To run, use:

truffle exec addSpaceToSector.js --sectorId 22 --parcels genesis.json --account 0x --password 123 --network ropsten (...)

Available flags:

--sectorId 22            - Blockchain sector id. Required
--parcels genesis.json   - List of parcels to add to the sector. It'll be truncated if it's longer than ${MAX_SPACE_PER_TX}
--account 0xdeadbeef     - Which account to use to deploy. Required
--password S0m3P4ss      - Password for the account.
--batchSize 50           - Simultaneous transactions. Default ${BATCH_SIZE}
--retryFailedTxs         - If this flag is present, the script will try to retry failed transactions
--logLevel debug         - Log level to use. Possible values: info, debug. Default: info

`),
  onRun: run
})

// This enables the script to be executed by `truffle exec` and to be exported
const runner = scriptRunner.getRunner(process.argv, REQUIRED_ARGS)
runner.addSpaceToSector = addSpaceToSector
module.exports = runner
