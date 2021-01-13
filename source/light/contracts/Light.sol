/*
  Copyright 2020 Swap Holdings Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

/* solhint-disable var-name-mixedcase */
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";

import "./interfaces/ILight.sol";

/**
 * @title Light: Simple atomic swap used on the AirSwap network
 * @notice https://www.airswap.io/
 */
contract Light is ILight {
  using SafeERC20 for IERC20;
  using ECDSA for bytes32;

  bytes32 public constant DOMAIN_TYPEHASH = keccak256(
    abi.encodePacked(
      "EIP712Domain(",
      "string name,",
      "string version,",
      "uint256 chainId,",
      "address verifyingContract",
      ")"
    )
  );

  bytes32 public constant ORDER_TYPEHASH = keccak256(
    abi.encodePacked(
      "LightOrder(",
      "uint256 nonce,",
      "uint256 expiry,",
      "address senderWallet,",
      "address signerToken,",
      "uint256 signerAmount,",
      "address senderToken,",
      "uint256 senderAmount",
      ")"
    )
  );

  bytes32 public constant DOMAIN_NAME = keccak256("SWAP_LIGHT");
  bytes32 public constant DOMAIN_VERSION = keccak256("3");
  uint256 public immutable DOMAIN_CHAIN_ID;
  bytes32 public immutable DOMAIN_SEPARATOR;

  // Double mapping of signers to nonce groups to nonce states.
  // The nonce group is computed as nonce / 256, so each group of 256 sequential nonces use the same key.
  // The nonce states are encoded as 256 bits, for each nonce in the group 0 means available and 1 means used.
  mapping(address => mapping(uint256 => uint256)) internal _nonceGroups;

  // Mapping of signer addresses to an optionally set minimum valid nonce
  mapping(address => uint256) public override signerMinimumNonce;

  constructor() public {
    uint256 currentChainId = getChainId();
    DOMAIN_CHAIN_ID = currentChainId;
    DOMAIN_SEPARATOR = keccak256(
      abi.encode(
        DOMAIN_TYPEHASH,
        DOMAIN_NAME,
        DOMAIN_VERSION,
        currentChainId,
        this
      )
    );
  }

  /**
   * @notice Atomic Token Swap
   * @param nonce Unique per order and should be sequential
   * @param expiry Expiry in seconds since 1 January 1970
   * @param signerToken Contract address of the ERC20 token that will be transferred from the signer
   * @param signerAmount Amount for signerToken
   * @param senderToken Contract address of the ERC20 token that will be transferred from the sender
   * @param senderAmount Amount for senderToken
   * @param signature Signature generated by the signer
   */
  function swap(
    uint256 nonce,
    uint256 expiry,
    IERC20 signerToken,
    uint256 signerAmount,
    IERC20 senderToken,
    uint256 senderAmount,
    bytes calldata signature
  ) external override {
    require(DOMAIN_CHAIN_ID == getChainId(), "CHAIN_ID_CHANGED");

    // Ensure the expiry has not passed.
    require(expiry > block.timestamp, "EXPIRY_PASSED");

    bytes32 hashed = _getHash(
      nonce,
      expiry,
      signerToken,
      signerAmount,
      senderToken,
      senderAmount
    );

    // Recover the signer from the hash and signature.
    address signer = _getSigner(hashed, signature);

    // Ensure the nonce is above the minimum.
    require(nonce >= signerMinimumNonce[signer], "NONCE_TOO_LOW");

    // Mark the nonce as used and ensure it hasn't been used before.
    require(_markNonceAsUsed(signer, nonce), "NONCE_ALREADY_USED");

    // Transfer token from sender to signer.
    senderToken.safeTransferFrom(msg.sender, signer, senderAmount);

    // Transfer token from signer to sender.
    signerToken.safeTransferFrom(signer, msg.sender, signerAmount);

    emit Swap(
      nonce,
      block.timestamp,
      signer,
      msg.sender,
      signerToken,
      senderToken,
      signerAmount,
      senderAmount
    );
  }

  /**
   * @notice Cancel one or more nonces
   * @dev Cancelled nonces are marked as used
   * @dev Emits a Cancel event
   * @dev Out of gas may occur in arrays of length > 400
   * @param nonces uint256[] List of nonces to cancel
   */
  function cancel(uint256[] calldata nonces) external override {
    for (uint256 i = 0; i < nonces.length; i++) {
      uint256 nonce = nonces[i];
      if (_markNonceAsUsed(msg.sender, nonce)) {
        emit Cancel(nonce, msg.sender);
      }
    }
  }

  /**
   * @notice Cancels all nonces below a value
   * @dev Emits a CancelUpTo event
   * @param minimumNonce uint256 Minimum valid nonce
   */
  function cancelUpTo(uint256 minimumNonce) external override {
    signerMinimumNonce[msg.sender] = minimumNonce;
    emit CancelUpTo(minimumNonce, msg.sender);
  }

  /**
   * @dev Returns true if the nonce has been used
   * @param signer address Address of the signer
   * @param nonce uint256 Nonce being checked
   */
  function nonceUsed(address signer, uint256 nonce)
    public
    override
    view
    returns (bool)
  {
    uint256 groupKey = nonce / 256;
    uint256 indexInGroup = nonce % 256;
    return (_nonceGroups[signer][groupKey] >> indexInGroup) & 1 == 1;
  }

  /**
   * @dev Returns the current chainId using the chainid opcode
   * @return id uint256 The chain id
   */
  function getChainId() public pure returns (uint256 id) {
    // no-inline-assembly
    assembly {
      id := chainid()
    }
  }

  /**
   * @dev Marks a nonce as used for the given signer
   * @param signer address Address of the signer for which to mark the nonce as used
   * @param nonce uint256 Nonce to be marked as used
   * @return bool True if the nonce was not marked as used already
   */
  function _markNonceAsUsed(address signer, uint256 nonce)
    internal
    returns (bool)
  {
    uint256 groupKey = nonce / 256;
    uint256 indexInGroup = nonce % 256;
    uint256 group = _nonceGroups[signer][groupKey];

    // If it is already used, return false
    if ((group >> indexInGroup) & 1 == 1) {
      return false;
    }

    _nonceGroups[signer][groupKey] = group | (uint256(1) << indexInGroup);

    return true;
  }

  function _getHash(
    uint256 nonce,
    uint256 expiry,
    IERC20 signerToken,
    uint256 signerAmount,
    IERC20 senderToken,
    uint256 senderAmount
  ) internal view returns (bytes32) {
    return
      keccak256(
        abi.encode(
          ORDER_TYPEHASH,
          nonce,
          expiry,
          msg.sender,
          signerToken,
          signerAmount,
          senderToken,
          senderAmount
        )
      );
  }

  function _getSigner(bytes32 orderHash, bytes calldata signature)
    internal
    view
    returns (address)
  {
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash)
    );

    // Recover the signer from the orderHash and signature
    return digest.recover(signature);
  }
}
