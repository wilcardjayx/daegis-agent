// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @notice Minimal ERC-20 for contract tests only. Per CLAUDE.md, mocks are
///         allowed in Foundry unit tests; the agent path (Phases 2+) is not
///         allowed to mock anything.
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @notice USDT-style: mutates state but returns no data. `_approveZero` must
///         treat an empty return as success.
contract NoReturnERC20 {
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }
}

/// @notice Returns `false` from approve without reverting. `_approveZero` must
///         reject this rather than report a revoke that never happened.
contract FalseReturnERC20 {
    function approve(address, uint256) external pure returns (bool) {
        return false;
    }
}

/// @notice A hostile "token" a rogue guardian might pass to `revoke`, trying to
///         re-enter the account and do something the guardian cannot do directly.
contract ReenteringToken {
    address public immutable account;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(address account_) {
        account = account_;
    }

    function approve(address, uint256) external returns (bool) {
        reentryAttempted = true;
        // Try to drain: ask the account to execute an arbitrary call for us.
        (bool ok,) = account.call(
            abi.encodeWithSignature(
                "execute(address,uint256,bytes)", address(this), uint256(0), bytes("")
            )
        );
        reentrySucceeded = ok;
        return true;
    }
}
