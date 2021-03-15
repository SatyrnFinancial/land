pragma solidity ^0.4.22;


contract ISectorRegistry {
  function mint(address to, string metadata) external returns (uint256);
  function ownerOf(uint256 _tokenId) public view returns (address _owner); // from ERC721

  // Events

  event CreateSector(
    address indexed _owner,
    uint256 indexed _sectorId,
    string _data
  );

  event AddSpace(
    uint256 indexed _sectorId,
    uint256 indexed _spaceId
  );

  event RemoveSpace(
    uint256 indexed _sectorId,
    uint256 indexed _spaceId,
    address indexed _destinatary
  );

  event Update(
    uint256 indexed _assetId,
    address indexed _holder,
    address indexed _operator,
    string _data
  );

  event UpdateOperator(
    uint256 indexed _sectorId,
    address indexed _operator
  );

  event UpdateManager(
    address indexed _owner,
    address indexed _operator,
    address indexed _caller,
    bool _approved
  );

  event SetSPACERegistry(
    address indexed _registry
  );

  event SetSectorSpaceBalanceToken(
    address indexed _previousSectorSpaceBalance,
    address indexed _newSectorSpaceBalance
  );
}
