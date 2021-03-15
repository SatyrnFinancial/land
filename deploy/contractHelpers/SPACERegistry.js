const { GAS_PRICE, GAS_LIMIT } = require('./txParams')
const { log } = require('../utils')

class SPACERegistry {
  constructor(account, address, txConfig = {}) {
    this.address = address
    this.account = account
    this.txConfig = {
      gasPrice: GAS_PRICE,
      gas: GAS_LIMIT,
      from: account,
      ...txConfig
    }

    this.contract = null
  }

  async setContract(artifacts) {
    const artifact = artifacts.require('SPACERegistry')
    this.contract = await artifact.at(this.address)
    return this
  }

  async getCurrentOwner(parcel) {
    return await this.contract.ownerOfSpace(parcel.x, parcel.y,parcel.z, this.txConfig)
  }

  async assignMultipleParcels(parcels, newOwner) {
    const { xs, ys } = this.getXYPairs(parcels)

    log.debug('Sending assignMultipleParcels\n', { xs, ys, newOwner })
    return await this.contract.assignMultipleParcels.sendTransaction(
      xs,
      ys,
      newOwner,
      this.txConfig
    )
  }

  async createSector(parcels, owner, data = '') {
    const { xs, ys } = this.getXYPairs(parcels)

    if (data) {
      log.debug('Sending createSectorWithMetadata\n', { xs, ys, owner, data })
      return this.contract.createSectorWithMetadata.sendTransaction(
        xs,
        ys,
        owner,
        data,
        this.txConfig
      )
    } else {
      log.debug('Sending createSector\n', { xs, ys, owner })
      return this.contract.createSector.sendTransaction(
        xs,
        ys,
        owner,
        this.txConfig
      )
    }
  }

  async transferManySpaceToSector(parcels, sectorId) {
    const { xs, ys } = this.getXYPairs(parcels)

    log.debug('Sending transferManySpaceToSector\n', { xs, ys, sectorId })
    return await this.contract.transferManySpaceToSector.sendTransaction(
      xs,
      ys,
      sectorId,
      this.txConfig
    )
  }

  getXYPairs(parcels) {
    const xs = []
    const ys = []
    for (let parcel of parcels) {
      xs.push(parcel.x)
      ys.push(parcel.y)
      zs.push(parcel.z)
    }
    return { xs, ys ,zs}
  }
}

module.exports = SPACERegistry
