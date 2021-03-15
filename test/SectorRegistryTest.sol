pragma solidity ^0.4.22;

import '../contracts/sector/SectorRegistry.sol';

contract SectorRegistryTest is SectorRegistry {
  constructor(
    string _name,
    string _symbol,
    address _registry
  )
    public
  {
    SectorRegistry.initialize(_name, _symbol, _registry);
  }

  function mintSector(address to, string metadata) public returns (uint256) {
    return _mintSector(to, metadata);
  }

  function getMetadataInterfaceId() public pure returns (bytes4) {
    return InterfaceId_GetMetadata;
  }

  function calculateXor(string salt, uint256 x, uint256 y) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(salt, x)) ^ keccak256(abi.encodePacked(y));
  }

  function compoundXor(bytes32 x, uint256 y) public pure returns (bytes32) {
    return x ^ keccak256(abi.encodePacked(y));
  }

  function safeTransferFromWithBytes(
    address from,
    address to,
    uint256 assetId,
    bytes data
  )
    public
  {
    safeTransferFrom(
      from,
      to,
      assetId,
      data
    );
  }

  function setSectorSpaceBalance(address _newSectorSpaceBalance) public {
    _setSectorSpaceBalanceToken(_newSectorSpaceBalance);
  }
}
