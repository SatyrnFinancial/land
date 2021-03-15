pragma solidity ^0.4.23;

import "../Storage.sol";

import "../upgradable/Ownable.sol";

import "../upgradable/IApplication.sol";

import "erc821/contracts/FullAssetRegistry.sol";

import "./ISPACERegistry.sol";

import "../metadata/IMetadataHolder.sol";

import "../sector/ISectorRegistry.sol";


/* solium-disable function-order */
contract SPACERegistry is Storage, Ownable, FullAssetRegistry, ISPACERegistry {
  bytes4 constant public GET_METADATA = bytes4(keccak256("getMetadata(uint256)"));

  function initialize(bytes) external {
    _name = "Decentraspace SPACE";
    _symbol = "SPACE";
    _description = "Contract that stores the Decentraspace SPACE registry";
  }

  modifier onlyProxyOwner() {
    require(msg.sender == proxyOwner, "This function can only be called by the proxy owner");
    _;
  }

  modifier onlyDeployer() {
    require(
      msg.sender == proxyOwner || authorizedDeploy[msg.sender],
      "This function can only be called by an authorized deployer"
    );
    _;
  }

  modifier onlyOwnerOf(uint256 assetId) {
    require(
      msg.sender == _ownerOf(assetId),
      "This function can only be called by the owner of the asset"
    );
    _;
  }

  modifier onlyUpdateAuthorized(uint256 tokenId) {
    require(
      msg.sender == _ownerOf(tokenId) ||
      _isAuthorized(msg.sender, tokenId) ||
      _isUpdateAuthorized(msg.sender, tokenId),
      "msg.sender is not authorized to update"
    );
    _;
  }

  modifier canSetUpdateOperator(uint256 tokenId) {
    address owner = _ownerOf(tokenId);
    require(
      _isAuthorized(msg.sender, tokenId) || updateManager[owner][msg.sender],
      "unauthorized user"
    );
    _;
  }

  //
  // Authorization
  //

  function isUpdateAuthorized(address operator, uint256 assetId) external view returns (bool) {
    return _isUpdateAuthorized(operator, assetId);
  }

  function _isUpdateAuthorized(address operator, uint256 assetId) internal view returns (bool) {
    address owner = _ownerOf(assetId);

    return owner == operator  ||
      updateOperator[assetId] == operator ||
      updateManager[owner][operator];
  }

  function authorizeDeploy(address beneficiary) external onlyProxyOwner {
    require(beneficiary != address(0), "invalid address");
    require(authorizedDeploy[beneficiary] == false, "address is already authorized");

    authorizedDeploy[beneficiary] = true;
    emit DeployAuthorized(msg.sender, beneficiary);
  }

  function forbidDeploy(address beneficiary) external onlyProxyOwner {
    require(beneficiary != address(0), "invalid address");
    require(authorizedDeploy[beneficiary], "address is already forbidden");

    authorizedDeploy[beneficiary] = false;
    emit DeployForbidden(msg.sender, beneficiary);
  }

  //
  // SPACE Create
  //

  function assignNewParcel(int x, int y, address beneficiary) external onlyDeployer {
    _generate(_encodeTokenId(x, y), beneficiary);
    _updateSpaceBalance(address(0), beneficiary);
  }

  function assignMultipleParcels(int[] x, int[] y, address beneficiary) external onlyDeployer {
    for (uint i = 0; i < x.length; i++) {
      _generate(_encodeTokenId(x[i], y[i]), beneficiary);
      _updateSpaceBalance(address(0), beneficiary);
    }
  }

  //
  // Inactive keys after 1 year lose ownership
  //

  function ping() external {
    // solium-disable-next-line security/no-block-members
    latestPing[msg.sender] = block.timestamp;
  }

  function setLatestToNow(address user) external {
    require(msg.sender == proxyOwner || _isApprovedForAll(msg.sender, user), "Unauthorized user");
    // solium-disable-next-line security/no-block-members
    latestPing[user] = block.timestamp;
  }

  //
  // SPACE Getters
  //

  function encodeTokenId(int x, int y) external pure returns (uint) {
    return _encodeTokenId(x, y);
  }

  function _encodeTokenId(int x, int y) internal pure returns (uint result) {
    require(
      -1000000 < x && x < 1000000 && -1000000 < y && y < 1000000,
      "The coordinates should be inside bounds"
    );
    return _unsafeEncodeTokenId(x, y);
  }

  function _unsafeEncodeTokenId(int x, int y) internal pure returns (uint) {
    return ((uint(x) * factor) & clearLow) | (uint(y) & clearHigh);
  }

  function decodeTokenId(uint value) external pure returns (int, int) {
    return _decodeTokenId(value);
  }

  function _unsafeDecodeTokenId(uint value) internal pure returns (int x, int y) {
    x = expandNegative128BitCast((value & clearLow) >> 128);
    y = expandNegative128BitCast(value & clearHigh);
  }

  function _decodeTokenId(uint value) internal pure returns (int x, int y) {
    (x, y) = _unsafeDecodeTokenId(value);
    require(
      -1000000 < x && x < 1000000 && -1000000 < y && y < 1000000,
      "The coordinates should be inside bounds"
    );
  }

  function expandNegative128BitCast(uint value) internal pure returns (int) {
    if (value & (1<<127) != 0) {
      return int(value | clearLow);
    }
    return int(value);
  }

  function exists(int x, int y) external view returns (bool) {
    return _exists(x, y);
  }

  function _exists(int x, int y) internal view returns (bool) {
    return _exists(_encodeTokenId(x, y));
  }

  function ownerOfSpace(int x, int y) external view returns (address) {
    return _ownerOfSpace(x, y);
  }

  function _ownerOfSpace(int x, int y) internal view returns (address) {
    return _ownerOf(_encodeTokenId(x, y));
  }

  function ownerOfSpaceMany(int[] x, int[] y) external view returns (address[]) {
    require(x.length > 0, "You should supply at least one coordinate");
    require(x.length == y.length, "The coordinates should have the same length");

    address[] memory addrs = new address[](x.length);
    for (uint i = 0; i < x.length; i++) {
      addrs[i] = _ownerOfSpace(x[i], y[i]);
    }

    return addrs;
  }

  function spaceOf(address owner) external view returns (int[], int[]) {
    uint256 len = _assetsOf[owner].length;
    int[] memory x = new int[](len);
    int[] memory y = new int[](len);

    int assetX;
    int assetY;
    for (uint i = 0; i < len; i++) {
      (assetX, assetY) = _decodeTokenId(_assetsOf[owner][i]);
      x[i] = assetX;
      y[i] = assetY;
    }

    return (x, y);
  }

  function tokenMetadata(uint256 assetId) external view returns (string) {
    return _tokenMetadata(assetId);
  }

  function _tokenMetadata(uint256 assetId) internal view returns (string) {
    address _owner = _ownerOf(assetId);
    if (_isContract(_owner) && _owner != address(sectorRegistry)) {
      if ((ERC165(_owner)).supportsInterface(GET_METADATA)) {
        return IMetadataHolder(_owner).getMetadata(assetId);
      }
    }
    return _assetData[assetId];
  }

  function spaceData(int x, int y) external view returns (string) {
    return _tokenMetadata(_encodeTokenId(x, y));
  }

  //
  // SPACE Transfer
  //

  function transferFrom(address from, address to, uint256 assetId) external {
    require(to != address(sectorRegistry), "SectorRegistry unsafe transfers are not allowed");
    return _doTransferFrom(
      from,
      to,
      assetId,
      "",
      false
    );
  }

  function transferSpace(int x, int y, address to) external {
    uint256 tokenId = _encodeTokenId(x, y);
    _doTransferFrom(
      _ownerOf(tokenId),
      to,
      tokenId,
      "",
      true
    );
  }

  function transferManySpace(int[] x, int[] y, address to) external {
    require(x.length > 0, "You should supply at least one coordinate");
    require(x.length == y.length, "The coordinates should have the same length");

    for (uint i = 0; i < x.length; i++) {
      uint256 tokenId = _encodeTokenId(x[i], y[i]);
      _doTransferFrom(
        _ownerOf(tokenId),
        to,
        tokenId,
        "",
        true
      );
    }
  }

  function transferSpaceToSector(int x, int y, uint256 sectorId) external {
    require(
      sectorRegistry.ownerOfssectorId) == msg.sender,
      "You must own the Sector you want to transfer to"
    );

    uint256 tokenId = _encodeTokenId(x, y);
    _doTransferFrom(
      _ownerOf(tokenId),
      address(sectorRegistry),
      tokenId,
      toBytes(sectorId),
      true
    );
  }

  function transferManySpaceToSector(int[] x, int[] y, uint256 sectorId) external {
    require(x.length > 0, "You should supply at least one coordinate");
    require(x.length == y.length, "The coordinates should have the same length");
    require(
      sectorRegistry.ownerOfssectorId) == msg.sender,
      "You must own the Sector you want to transfer to"
    );

    for (uint i = 0; i < x.length; i++) {
      uint256 tokenId = _encodeTokenId(x[i], y[i]);
      _doTransferFrom(
        _ownerOf(tokenId),
        address(sectorRegistry),
        tokenId,
        toBytes(sectorId),
        true
      );
    }
  }

  /**
   * @notice Set SPACE updateOperator
   * @param assetId - SPACE id
   * @param operator - address of the account to be set as the updateOperator
   */
  function setUpdateOperator(
    uint256 assetId,
    address operator
  )
    public
    canSetUpdateOperator(assetId)
  {
    updateOperator[assetId] = operator;
    emit UpdateOperator(assetId, operator);
  }

  /**
   * @notice Set many SPACE updateOperator
   * @param _assetIds - SPACE ids
   * @param _operator - address of the account to be set as the updateOperator
   */
  function setManyUpdateOperator(
    uint256[] _assetIds,
    address _operator
  )
    public
  {
    for (uint i = 0; i < _assetIds.length; i++) {
      setUpdateOperator(_assetIds[i], _operator);
    }
  }

  /**
  * @dev Set an updateManager for an account
  * @param _owner - address of the account to set the updateManager
  * @param _operator - address of the account to be set as the updateManager
  * @param _approved - bool whether the address will be approved or not
  */
  function setUpdateManager(address _owner, address _operator, bool _approved) external {
    require(_operator != msg.sender, "The operator should be different from owner");
    require(
      _owner == msg.sender ||
      _isApprovedForAll(_owner, msg.sender),
      "Unauthorized user"
    );

    updateManager[_owner][_operator] = _approved;

    emit UpdateManager(
      _owner,
      _operator,
      msg.sender,
      _approved
    );
  }

  //
  // Sector generation
  //

  event SectorRegistrySet(address indexed registry);

  function setSectorRegistry(address registry) external onlyProxyOwner {
    sectorRegistry = ISectorRegistry(registry);
    emit SectorRegistrySet(registry);
  }

  function createSector(int[] x, int[] y, address beneficiary) external returns (uint256) {
    // solium-disable-next-line arg-overflow
    return _createSector(x, y, beneficiary, "");
  }

  function createSectorWithMetadata(
    int[] x,
    int[] y,
    address beneficiary,
    string metadata
  )
    external
    returns (uint256)
  {
    // solium-disable-next-line arg-overflow
    return _createSector(x, y, beneficiary, metadata);
  }

  function _createSector(
    int[] x,
    int[] y,
    address beneficiary,
    string metadata
  )
    internal
    returns (uint256)
  {
    require(x.length > 0, "You should supply at least one coordinate");
    require(x.length == y.length, "The coordinates should have the same length");
    require(address(sectorRegistry) != 0, "The Sector registry should be set");

    uint256 sectorTokenId =ssectorRegistry.mint(beneficiary, metadata);
    bytes memory sectorTokenIdBytes = toBytesssectorTokenId);

    for (uint i = 0; i < x.length; i++) {
      uint256 tokenId = _encodeTokenId(x[i], y[i]);
      _doTransferFrom(
        _ownerOf(tokenId),
        address(sectorRegistry),
        tokenId,
        sectorTokenIdBytes,
        true
      );
    }

    return sectorTokenId;
  }

  function toBytes(uint256 x) internal pure returns (bytes b) {
    b = new bytes(32);
    // solium-disable-next-line security/no-inline-assembly
    assembly { mstore(add(b, 32), x) }
  }

  //
  // SPACE Update
  //

  function updateSpaceData(
    int x,
    int y,
    string data
  )
    external
  {
    return _updateSpaceData(x, y, data);
  }

  function _updateSpaceData(
    int x,
    int y,
    string data
  )
    internal
    onlyUpdateAuthorized(_encodeTokenId(x, y))
  {
    uint256 assetId = _encodeTokenId(x, y);
    address owner = _holderOf[assetId];

    _update(assetId, data);

    emit Update(
      assetId,
      owner,
      msg.sender,
      data
    );
  }

  function updateManySpaceData(int[] x, int[] y, string data) external {
    require(x.length > 0, "You should supply at least one coordinate");
    require(x.length == y.length, "The coordinates should have the same length");
    for (uint i = 0; i < x.length; i++) {
      _updateSpaceData(x[i], y[i], data);
    }
  }

  /**
   * @dev Set a new space balance minime token
   * @notice Set new space balance token: `_newSpaceBalance`
   * @param _newSpaceBalance address of the new space balance token
   */
  function setSpaceBalanceToken(address _newSpaceBalance) onlyProxyOwner external {
    require(_newSpaceBalance != address(0), "New spaceBalance should not be zero address");
    emit SetSpaceBalanceToken(spaceBalance, _newSpaceBalance);
    spaceBalance = IMiniMeToken(_newSpaceBalance);
  }

   /**
   * @dev Register an account balance
   * @notice Register space Balance
   */
  function registerBalance() external {
    require(!registeredBalance[msg.sender], "Register Balance::The user is already registered");

    // Get balance of the sender
    uint256 currentBalance = spaceBalance.balanceOf(msg.sender);
    if (currentBalance > 0) {
      require(
        spaceBalance.destroyTokens(msg.sender, currentBalance),
        "Register Balance::Could not destroy tokens"
      );
    }

    // Set balance as registered
    registeredBalance[msg.sender] = true;

    // Get SPACE balance
    uint256 newBalance = _balanceOf(msg.sender);

    // Generate Tokens
    require(
      spaceBalance.generateTokens(msg.sender, newBalance),
      "Register Balance::Could not generate tokens"
    );
  }

  /**
   * @dev Unregister an account balance
   * @notice Unregister space Balance
   */
  function unregisterBalance() external {
    require(registeredBalance[msg.sender], "Unregister Balance::The user not registered");

    // Set balance as unregistered
    registeredBalance[msg.sender] = false;

    // Get balance
    uint256 currentBalance = spaceBalance.balanceOf(msg.sender);

    // Destroy Tokens
    require(
      spaceBalance.destroyTokens(msg.sender, currentBalance),
      "Unregister Balance::Could not destroy tokens"
    );
  }

  function _doTransferFrom(
    address from,
    address to,
    uint256 assetId,
    bytes userData,
    bool doCheck
  )
    internal
  {
    updateOperator[assetId] = address(0);
    _updateSpaceBalance(from, to);
    super._doTransferFrom(
      from,
      to,
      assetId,
      userData,
      doCheck
    );
  }

  function _isContract(address addr) internal view returns (bool) {
    uint size;
    // solium-disable-next-line security/no-inline-assembly
    assembly { size := extcodesize(addr) }
    return size > 0;
  }

  /**
   * @dev Update account balances
   * @param _from account
   * @param _to account
   */
  function _updateSpaceBalance(address _from, address _to) internal {
    if (registeredBalance[_from]) {
      spaceBalance.destroyTokens(_from, 1);
    }

    if (registeredBalance[_to]) {
      spaceBalance.generateTokens(_to, 1);
    }
  }
}
