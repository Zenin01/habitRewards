// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StakeAndSweat} from "../StakeAndSweat.sol";

/// @dev Minimal 6-decimal ERC20 for tests. `shortChange` makes transferFrom deliver 1 unit less.
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    bool public shortChange;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setShortChange(bool v) external {
        shortChange = v;
    }

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
        _move(msg.sender, to, amount, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount, shortChange ? amount - 1 : amount);
        return true;
    }

    function _move(address from, address to, uint256 debit, uint256 credit) internal {
        require(balanceOf[from] >= debit, "balance");
        balanceOf[from] -= debit;
        balanceOf[to] += credit;
        emit Transfer(from, to, credit);
    }
}

abstract contract StakeAndSweatTestBase is Test {
    StakeAndSweat internal sas;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal erin = makeAddr("erin");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant STAKE = 10e6;
    uint64 internal joinDl;
    uint64 internal endT;
    uint64 internal verDl;

    function setUp() public virtual {
        vm.warp(1000);
        usdc = new MockUSDC();
        sas = new StakeAndSweat(address(usdc), admin);
        joinDl = uint64(block.timestamp + 1 days);
        endT = uint64(block.timestamp + 2 days);
        verDl = uint64(block.timestamp + 3 days);
    }

    function _create() internal returns (uint256) {
        vm.prank(admin);
        return sas.createChallenge("Run 5k", STAKE, joinDl, endT, verDl);
    }

    function _join(uint256 id, address p) internal {
        usdc.mint(p, STAKE);
        vm.startPrank(p);
        usdc.approve(address(sas), STAKE);
        sas.join(id);
        vm.stopPrank();
    }

    function _set(uint256 id, address[] memory players, bool done) internal {
        vm.prank(admin);
        sas.setCompletions(id, players, done);
    }

    function _one(address a) internal pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = a;
    }

    function _two(address a, address b) internal pure returns (address[] memory arr) {
        arr = new address[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _three(address a, address b, address c) internal pure returns (address[] memory arr) {
        arr = new address[](3);
        arr[0] = a;
        arr[1] = b;
        arr[2] = c;
    }

    function _finalizeAsAdmin(uint256 id) internal {
        vm.prank(admin);
        sas.finalize(id);
    }

    /// 5 players join; alice, bob, carol complete; dave, erin fail. Warped to endT, not finalized.
    function _fiveJoinedThreeComplete() internal returns (uint256 id) {
        id = _create();
        _join(id, alice);
        _join(id, bob);
        _join(id, carol);
        _join(id, dave);
        _join(id, erin);
        vm.warp(endT);
        _set(id, _three(alice, bob, carol), true);
    }
}
