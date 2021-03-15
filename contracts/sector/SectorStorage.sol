pragma solidity ^0.4.23;

import "../minimeToken/IMinimeToken.sol";

contract SPACERegistry {
  function decodeTokenId(uint value) external pure returns (int, int);
  function updateSpaceData(int x, int y, string data) external;
  function setUpdateOperator(uint256 assetId, address operator) external;
  function setManyUpdateOperator(uint256[] spaceIds, address operator) external;
  function ping() public;
  function ownerOf(uint256 tokenId) public returns (address);
  function safeTransferFrom(address, address, uint256) public;
  function updateOperator(uint256 spaceId) public returns (address);
}


contract SectorStorage {
  bytes4 internal constant InterfaceId_GetMetadata = bytes4(keccak256("getMetadata(uint256)"));
  bytes4 internal constant InterfaceId_VerifyFingerprint = bytes4(
    keccak256("verifyFingerprint(uint256,bytes)")
  );

  SPACERegistry public registry;

  // From Sector to list of owned SPACE ids (SPACEs)
  mapping(uint256 => uint256[]) public sectorSpaceIds;

  // From SPACE id (SPACE) to its owner Sector id
  mapping(uint256 => uint256) public spaceIdSector;

  // From Sector id to mapping of SPACE id to index on the array above (sectorSpaceIds)
  mapping(uint256 => mapping(uint256 => uint256)) public sectorSpaceIndex;

  // Metadata of the Sector
  mapping(uint256 => string) internal sectorData;

  // Operator of the Sector
  mapping (uint256 => address) public updateOperator;

  // From account to mapping of operator to bool whether is allowed to update content or not
  mapping(address => mapping(address => bool)) public updateManager;

  // Space balance minime token
  IMiniMeToken public sectorSpaceBalance;

  // Registered balance accounts
  mapping(address => bool) public registeredBalance;

}
