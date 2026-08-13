// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Minimal ERC-721, deployed to testnet purely to generate a REAL
///         `Approval` log for the detector's fixtures.
///
/// The point it exists to prove: ERC-721's
/// `Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)`
/// has the same signature string as ERC-20's `Approval(address,address,uint256)`,
/// so both hash to topic0 0x8c5be1e5…c3b925. Indexing `tokenId` is what makes
/// the ERC-721 log 4 topics with empty data, and that shape difference is the
/// only thing separating the two on the wire.
///
/// The demo mints a tokenId of type(uint256).max: decoded as if it were an
/// ERC-20 allowance, that reads as an infinite approval — the exact false
/// positive `detect.is_erc20_approval` exists to prevent.
contract MockERC721 {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public getApproved;

    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    error NotTokenOwner(address caller, uint256 tokenId);

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        if (msg.sender != ownerOf[tokenId]) revert NotTokenOwner(msg.sender, tokenId);
        getApproved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }
}
