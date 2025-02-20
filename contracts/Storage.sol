pragma solidity ^0.4.18;

import "./upgradable/ProxyStorage.sol";

import "./upgradable/OwnableStorage.sol";

import "erc821/contracts/AssetRegistryStorage.sol";

import "./space/SPACEStorage.sol";


contract Storage is ProxyStorage, OwnableStorage, AssetRegistryStorage, SPACEStorage {
}
