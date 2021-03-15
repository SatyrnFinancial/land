pragma solidity ^0.4.18;

import "../contracts/space/SPACERegistry.sol";

contract SPACERegistryTest is SPACERegistry {
  function safeTransferFromToSector(address from, address to, uint256 assetId, uint256 sectorId) external {
    _doTransferFrom(from, to, assetId, toBytes(sectorId), true);
  }

  function existsProxy(int x, int y) public view returns (bool) {
    return _exists(_encodeTokenId(x, y));
  }

  function isDeploymentAuthorized(address beneficiary) public view returns (bool) {
    return authorizedDeploy[beneficiary];
  }
}
