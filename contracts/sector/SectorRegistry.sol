pragma solidity ^0.4.23;


import "openzeppelin-zos/contracts/token/ERC721/ERC721Token.sol";
import "openzeppelin-zos/contracts/token/ERC721/ERC721Receiver.sol";
import "openzeppelin-zos/contracts/ownership/Ownable.sol";
import "zos-lib/contracts/migrations/Migratable.sol";

import "./ISectorRegistry.sol";
import "./SectorStorage.sol";


/**
 * @title ERC721 registry of every minted Sector and their owned SPACEs
 * @dev Usings we are inheriting and depending on:
 * From ERC721Token:
 *   - using SafeMath for uint256;
 *   - using AddressUtils for address;
 */
// solium-disable-next-line max-len
contract SectorRegistry is Migratable, ISectorRegistry, ERC721Token, ERC721Receiver, Ownable, SectorStorage {
  modifier canTransfer(uint256 sectorId) {
    require(isApprovedOrOwner(msg.sender, sectorId), "Only owner or operator can transfer");
    _;
  }

  modifier onlyRegistry() {
    require(msg.sender == address(registry), "Only the registry can make this operation");
    _;
  }

  modifier onlyUpdateAuthorized(uint256 sectorId) {
    require(_isUpdateAuthorized(msg.sender, sectorId), "Unauthorized user");
    _;
  }

  modifier onlySpaceUpdateAuthorized(uint256 sectorId, uint256 spaceId) {
    require(_isSpaceUpdateAuthorized(msg.sender, sectorId, spaceId), "unauthorized user");
    _;
  }

  modifier canSetUpdateOperator(uint256 sectorId) {
    address owner = ownerOf(sectorId);
    require(
      isApprovedOrOwner(msg.sender, sectorId) || updateManager[owner][msg.sender],
      "unauthorized user"
    );
    _;
  }

  /**
   * @dev Mint a new Sector with some metadata
   * @param to The address that will own the minted token
   * @param metadata Set an initial metadata
   * @return An uint256 representing the new token id
   */
  function mint(address to, string metadata) external onlyRegistry returns (uint256) {
    return _mintSector(to, metadata);
  }

  /**
   * @notice Transfer a SPACE owned by an Sector to a new owner
   * @param sectorId Current owner of the token
   * @param spaceId SPACE to be transfered
   * @param destinatary New owner
   */
  function transferSpace(
    uint256 sectorId,
    uint256 spaceId,
    address destinatary
  )
    external
    canTransfer(sectorId)
  {
    return _transferSpace(sectorId, spaceId, destinatary);
  }

  /**
   * @notice Transfer many tokens owned by an Sector to a new owner
   * @param sectorId Current owner of the token
   * @param spaceIds SPACEs to be transfered
   * @param destinatary New owner
   */
  function transferManySpaces(
    uint256 sectorId,
    uint256[] spaceIds,
    address destinatary
  )
    external
    canTransfer(sectorId)
  {
    uint length = spaceIds.length;
    for (uint i = 0; i < length; i++) {
      _transferSpace(sectorId, spaceIds[i], destinatary);
    }
  }

  /**
   * @notice Get the Sector id for a given SPACE id
   * @dev This information also lives on sectorSpaceIds,
   *   but it being a mapping you need to know the Sector id beforehand.
   * @param spaceId SPACE to search
   * @return The corresponding Sector id
   */
  function getSpaceSectorId(uint256 spaceId) external view returns (uint256) {
    return spaceIdSector[spaceId];
  }

  function setSPACERegistry(address _registry) external onlyOwner {
    require(_registry.isContract(), "The SPACE registry address should be a contract");
    require(_registry != 0, "The SPACE registry address should be valid");
    registry = SPACERegistry(_registry);
    emit SetSPACERegistry(registry);
  }

  function ping() external {
    registry.ping();
  }

  /**
   * @notice Return the amount of tokens for a given Sector
   * @param sectorId Sector id to search
   * @return Tokens length
   */
  function getSectorSize(uint256 sectorId) external view returns (uint256) {
    return sectorSpaceIds[sectorId].length;
  }

  /**
   * @notice Return the amount of SPACEs inside the Sectors for a given address
   * @param _owner of the sectors
   * @return the amount of SPACEs
   */
  function getSPACEsSize(address _owner) public view returns (uint256) {
    // Avoid balanceOf to not compute an unnecesary require
    uint256 spacesSize;
    uint256 balance = ownedTokensCount[_owner];
    for (uint256 i; i < balance; i++) {
      uint256 sectorId = ownedTokens[_owner][i];
      spacesSize += sectorSpaceIds[sectorId].length;
    }
    return spacesSize;
  }

  /**
   * @notice Update the metadata of an Sector
   * @dev Reverts if the Sector does not exist or the user is not authorized
   * @param sectorId Sector id to update
   * @param metadata string metadata
   */
  function updateMetadata(
    uint256 sectorId,
    string metadata
  )
    external
    onlyUpdateAuthorized(sectorId)
  {
    _updateMetadata(sectorId, metadata);

    emit Update(
      sectorId,
      ownerOf(sectorId),
      msg.sender,
      metadata
    );
  }

  function getMetadata(uint256 sectorId) external view returns (string) {
    return sectorData[sectorId];
  }

  function isUpdateAuthorized(address operator, uint256 sectorId) external view returns (bool) {
    return _isUpdateAuthorized(operator, sectorId);
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
      _owner == msg.sender
      || operatorApprovals[_owner][msg.sender],
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

  /**
   * @notice Set Sector updateOperator
   * @param sectorId - Sector id
   * @param operator - address of the account to be set as the updateOperator
   */
  function setUpdateOperator(
    uint256 sectorId,
    address operator
  )
    public
    canSetUpdateOperator(sectorId)
  {
    updateOperator[sectorId] = operator;
    emit UpdateOperator(sectorId, operator);
  }

  /**
   * @notice Set Sectors updateOperator
   * @param _sectorIds - Sector ids
   * @param _operator - address of the account to be set as the updateOperator
   */
  function setManyUpdateOperator(
    uint256[] _sectorIds,
    address _operator
  )
    public
  {
    for (uint i = 0; i < _sectorIds.length; i++) {
      setUpdateOperator(_sectorIds[i], _operator);
    }
  }

  /**
   * @notice Set SPACE updateOperator
   * @param sectorId - Sector id
   * @param spaceId - SPACE to set the updateOperator
   * @param operator - address of the account to be set as the updateOperator
   */
  function setSpaceUpdateOperator(
    uint256 sectorId,
    uint256 spaceId,
    address operator
  )
    public
    canSetUpdateOperator(sectorId)
  {
    require(spaceIdSector[spaceId] == sectorId, "The SPACE is not part of the Sector");
    registry.setUpdateOperator(spaceId, operator);
  }

 /**
   * @notice Set many SPACE updateOperator
   * @param _sectorId - Sector id
   * @param _spaceIds - SPACEs to set the updateOperator
   * @param _operator - address of the account to be set as the updateOperator
   */
  function setManySpaceUpdateOperator(
    uint256 _sectorId,
    uint256[] _spaceIds,
    address _operator
  )
    public
    canSetUpdateOperator(_sectorId)
  {
    for (uint i = 0; i < _spaceIds.length; i++) {
      require(spaceIdSector[_spaceIds[i]] == _sectorId, "The SPACE is not part of the Sector");
    }
    registry.setManyUpdateOperator(_spaceIds, _operator);
  }

  function initialize(
    string _name,
    string _symbol,
    address _registry
  )
    public
    isInitializer("SectorRegistry", "0.0.2")
  {
    require(_registry != 0, "The registry should be a valid address");

    ERC721Token.initialize(_name, _symbol);
    Ownable.initialize(msg.sender);
    registry = SPACERegistry(_registry);
  }

  /**
   * @notice Handle the receipt of an NFT
   * @dev The ERC721 smart contract calls this function on the recipient
   * after a `safetransfer`. This function MAY throw to revert and reject the
   * transfer. Return of other than the magic value MUST result in the
   * transaction being reverted.
   * Note: the contract address is always the message sender.
   * @param _operator The address which called `safeTransferFrom` function
   * @param _from The address which previously owned the token
   * @param _tokenId The NFT identifier which is being transferred
   * @param _data Additional data with no specified format
   * @return `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`
   */
  function onERC721Received(
    address _operator,
    address _from,
    uint256 _tokenId,
    bytes _data
  )
    public
    onlyRegistry
    returns (bytes4)
  {
    uint256 sectorId = _bytesToUint(_data);
    _pushSpaceId(sectorId, _tokenId);
    return ERC721_RECEIVED;
  }

  /**
   * @dev Creates a checksum of the contents of the Sector
   * @param sectorId the sectorId to be verified
   */
  function getFingerprint(uint256 sectorId)
    public
    view
    returns (bytes32 result)
  {
    result = keccak256(abi.encodePacked("sectorId", sectorId));

    uint256 length = sectorSpaceIds[sectorId].length;
    for (uint i = 0; i < length; i++) {
      result ^= keccak256(abi.encodePacked(sectorSpaceIds[sectorId][i]));
    }
    return result;
  }

  /**
   * @dev Verifies a checksum of the contents of the Sector
   * @param sectorId the sectorid to be verified
   * @param fingerprint the user provided identification of the Sector contents
   */
  function verifyFingerprint(uint256 sectorId, bytes fingerprint) public view returns (bool) {
    return getFingerprint(sectorId) == _bytesToBytes32(fingerprint);
  }

  /**
   * @dev Safely transfers the ownership of multiple Sector IDs to another address
   * @dev Delegates to safeTransferFrom for each transfer
   * @dev Requires the msg sender to be the owner, approved, or operator
   * @param from current owner of the token
   * @param to address to receive the ownership of the given token ID
   * @param sectorIds uint256 array of IDs to be transferred
  */
  function safeTransferManyFrom(address from, address to, uint256[] sectorIds) public {
    safeTransferManyFrom(
      from,
      to,
      sectorIds,
      ""
    );
  }

  /**
   * @dev Safely transfers the ownership of multiple Sector IDs to another address
   * @dev Delegates to safeTransferFrom for each transfer
   * @dev Requires the msg sender to be the owner, approved, or operator
   * @param from current owner of the token
   * @param to address to receive the ownership of the given token ID
   * @param sectorIds uint256 array of IDs to be transferred
   * @param data bytes data to send along with a safe transfer check
  */
  function safeTransferManyFrom(
    address from,
    address to,
    uint256[] sectorIds,
    bytes data
  )
    public
  {
    for (uint i = 0; i < sectorIds.length; i++) {
      safeTransferFrom(
        from,
        to,
        sectorIds[i],
        data
      );
    }
  }

  /**
   * @dev update SPACE data owned by an Sector
   * @param sectorId Sector
   * @param spaceId SPACE to be updated
   * @param data string metadata
   */
  function updateSpaceData(uint256 sectorId, uint256 spaceId, string data) public {
    _updateSpaceData(sectorId, spaceId, data);
  }

  /**
   * @dev update SPACEs data owned by an Sector
   * @param sectorId Sector id
   * @param spaceIds SPACEs to be updated
   * @param data string metadata
   */
  function updateManySpaceData(uint256 sectorId, uint256[] spaceIds, string data) public {
    uint length = spaceIds.length;
    for (uint i = 0; i < length; i++) {
      _updateSpaceData(sectorId, spaceIds[i], data);
    }
  }

  function transferFrom(address _from, address _to, uint256 _tokenId)
  public
  {
    updateOperator[_tokenId] = address(0);
    _updateSectorSpaceBalance(_from, _to, sectorSpaceIds[_tokenId].length);
    super.transferFrom(_from, _to, _tokenId);
  }

  // check the supported interfaces via ERC165
  function _supportsInterface(bytes4 _interfaceId) internal view returns (bool) {
    // solium-disable-next-line operator-whitespace
    return super._supportsInterface(_interfaceId)
      || _interfaceId == InterfaceId_GetMetadata
      || _interfaceId == InterfaceId_VerifyFingerprint;
  }

  /**
   * @dev Internal function to mint a new Sector with some metadata
   * @param to The address that will own the minted token
   * @param metadata Set an initial metadata
   * @return An uint256 representing the new token id
   */
  function _mintSector(address to, string metadata) internal returns (uint256) {
    require(to != address(0), "You can not mint to an empty address");
    uint256 sectorId = _getNewSectorId();
    _mint(to, sectorId);
    _updateMetadata(sectorId, metadata);
    emit CreateSector(to, sectorId, metadata);
    return sectorId;
  }

  /**
   * @dev Internal function to update an Sector metadata
   * @dev Does not require the Sector to exist, for a public interface use `updateMetadata`
   * @param sectorId Sector id to update
   * @param metadata string metadata
   */
  function _updateMetadata(uint256 sectorId, string metadata) internal {
    sectorData[sectorId] = metadata;
  }

  /**
   * @notice Return a new unique id
   * @dev It uses totalSupply to determine the next id
   * @return uint256 Representing the new Sector id
   */
  function _getNewSectorId() internal view returns (uint256) {
    return totalSupply().add(1);
  }

  /**
   * @dev Appends a new SPACE id to an Sector updating all related storage
   * @param sectorId Sector where the SPACE should go
   * @param spaceId Transfered SPACE
   */
  function _pushSpaceId(uint256 sectorId, uint256 spaceId) internal {
    require(exists(sectorId), "The Sector id should exist");
    require(spaceIdSector[spaceId] == 0, "The SPACE is already owned by an Sector");
    require(registry.ownerOf(spaceId) == address(this), "The SectorRegistry cannot manage the SPACE");

    sectorSpaceIds[sectorId].push(spaceId);

    spaceIdSector[spaceId] = sectorId;

    sectorSpaceIndex[sectorId][spaceId] = sectorSpaceIds[sectorId].length;

    address owner = ownerOf(sectorId);
    _updateSectorSpaceBalance(address(registry), owner, 1);

    emit AddSpace(sectorId, spaceId);
  }

  /**
   * @dev Removes a SPACE from an Sector and transfers it to a new owner
   * @param sectorId Current owner of the SPACE
   * @param spaceId SPACE to be transfered
   * @param destinatary New owner
   */
  function _transferSpace(
    uint256 sectorId,
    uint256 spaceId,
    address destinatary
  )
    internal
  {
    require(destinatary != address(0), "You can not transfer SPACE to an empty address");

    uint256[] storage spaceIds = sectorSpaceIds[sectorId];
    mapping(uint256 => uint256) spaceIndex = sectorSpaceIndex[sectorId];

    /**
     * Using 1-based indexing to be able to make this check
     */
    require(spaceIndex[spaceId] != 0, "The SPACE is not part of the Sector");

    uint lastIndexInArray = spaceIds.length.sub(1);

    /**
     * Get the spaceIndex of this token in the spaceIds list
     */
    uint indexInArray = spaceIndex[spaceId].sub(1);

    /**
     * Get the spaceId at the end of the spaceIds list
     */
    uint tempTokenId = spaceIds[lastIndexInArray];

    /**
     * Store the last token in the position previously occupied by spaceId
     */
    spaceIndex[tempTokenId] = indexInArray.add(1);
    spaceIds[indexInArray] = tempTokenId;

    /**
     * Delete the spaceIds[last element]
     */
    delete spaceIds[lastIndexInArray];
    spaceIds.length = lastIndexInArray;

    /**
     * Drop this spaceId from both the spaceIndex and spaceId list
     */
    spaceIndex[spaceId] = 0;

    /**
     * Drop this spaceId Sector
     */
    spaceIdSector[spaceId] = 0;

    address owner = ownerOf(sectorId);
    _updateSectorSpaceBalance(owner, address(registry), 1);

    registry.safeTransferFrom(this, destinatary, spaceId);


    emit RemoveSpace(sectorId, spaceId, destinatary);
  }

  function _isUpdateAuthorized(address operator, uint256 sectorId) internal view returns (bool) {
    address owner = ownerOf(sectorId);

    return isApprovedOrOwner(operator, sectorId)
      || updateOperator[sectorId] == operator
      || updateManager[owner][operator];
  }

  function _isSpaceUpdateAuthorized(
    address operator,
    uint256 sectorId,
    uint256 spaceId
  )
    internal returns (bool)
  {
    return _isUpdateAuthorized(operator, sectorId) || registry.updateOperator(spaceId) == operator;
  }

  function _bytesToUint(bytes b) internal pure returns (uint256) {
    return uint256(_bytesToBytes32(b));
  }

  function _bytesToBytes32(bytes b) internal pure returns (bytes32) {
    bytes32 out;

    for (uint i = 0; i < b.length; i++) {
      out |= bytes32(b[i] & 0xFF) >> i.mul(8);
    }

    return out;
  }

  function _updateSpaceData(
    uint256 sectorId,
    uint256 spaceId,
    string data
  )
    internal
    onlySpaceUpdateAuthorized(sectorId, spaceId)
  {
    require(spaceIdSector[spaceId] == sectorId, "The SPACE is not part of the Sector");
    int x;
    int y;
    (x, y) = registry.decodeTokenId(spaceId);
    registry.updateSpaceData(x, y, data);
  }

  /**
   * @dev Set a new sector space balance minime token
   * @param _newSectorSpaceBalance address of the new sector space balance token
   */
  function _setSectorSpaceBalanceToken(address _newSectorSpaceBalance) internal {
    require(_newSectorSpaceBalance != address(0), "New sectorSpaceBalance should not be zero address");
    emit SetSectorSpaceBalanceToken(sectorSpaceBalance, _newSectorSpaceBalance);
    sectorSpaceBalance = IMiniMeToken(_newSectorSpaceBalance);
  }

   /**
   * @dev Register an account balance
   * @notice Register space Balance
   */
  function registerBalance() external {
    require(!registeredBalance[msg.sender], "Register Balance::The user is already registered");

    // Get balance of the sender
    uint256 currentBalance = sectorSpaceBalance.balanceOf(msg.sender);
    if (currentBalance > 0) {
      require(
        sectorSpaceBalance.destroyTokens(msg.sender, currentBalance),
        "Register Balance::Could not destroy tokens"
      );
    }

    // Set balance as registered
    registeredBalance[msg.sender] = true;

    // Get SPACE balance
    uint256 newBalance = getSPACEsSize(msg.sender);

    // Generate Tokens
    require(
      sectorSpaceBalance.generateTokens(msg.sender, newBalance),
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
    uint256 currentBalance = sectorSpaceBalance.balanceOf(msg.sender);

    // Destroy Tokens
    require(
      sectorSpaceBalance.destroyTokens(msg.sender, currentBalance),
      "Unregister Balance::Could not destroy tokens"
    );
  }

  /**
   * @dev Update account balances
   * @param _from account
   * @param _to account
   * @param _amount to update
   */
  function _updateSectorSpaceBalance(address _from, address _to, uint256 _amount) internal {
    if (registeredBalance[_from]) {
      sectorSpaceBalance.destroyTokens(_from, _amount);
    }

    if (registeredBalance[_to]) {
      sectorSpaceBalance.generateTokens(_to, _amount);
    }
  }

  /**
   * @dev Set a sector space balance minime token hardcoded because of the
   * contraint of the proxy for using an owner
   * Mainnet: 0x8568f23f343694650370fe5e254b55bfb704a6c7
   */
  function setSectorSpaceBalanceToken() external {
    require(sectorSpaceBalance == address(0), "sectorSpaceBalance was set");
    _setSectorSpaceBalanceToken(address(0x8568f23f343694650370fe5e254b55bfb704a6c7));
  }
}
