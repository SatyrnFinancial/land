#! /bin/bash

REGISTRY=SPACERegistry.sol
PROXY=SPACEProxy.sol
SECTOR_REGISTRY=SectorRegistry.sol


OUTPUT=full

npx truffle-flattener contracts/space/$REGISTRY > $OUTPUT/$REGISTRY
npx truffle-flattener contracts/upgradable/$PROXY > $OUTPUT/$PROXY
npx truffle-flattener contracts/sector/$SECTOR_REGISTRY > $OUTPUT/$SECTOR_REGISTRY

