// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChangeJar} from "../src/ChangeJar.sol";

contract RejectingDev {
    receive() external payable {
        revert("no");
    }

    function claim(ChangeJar j) external {
        j.withdraw();
    }
}

contract ReentrantDev {
    ChangeJar public jar;
    uint256 public attempts;

    constructor(ChangeJar j) {
        jar = j;
    }

    function claim() external {
        jar.withdraw();
    }

    receive() external payable {
        attempts++;
        // 回调里再次领取，应当失败（重入保护或余额已清零）
        try jar.withdraw() {} catch {}
    }
}

contract ChangeJarTest is Test {
    ChangeJar jar;
    address pm = address(0xA11CE);
    address dev1 = address(0xD1);
    address dev2 = address(0xD2);
    address stranger = address(0xBAD);
    uint256 constant FEE = 0.1 ether;
    uint256 constant DEPOSIT = 0.8 ether; // 8 x fee

    function setUp() public {
        jar = new ChangeJar();
        vm.deal(pm, 100 ether);
        vm.deal(stranger, 1 ether);
    }

    function _devs() internal view returns (address[] memory d) {
        d = new address[](2);
        d[0] = dev1;
        d[1] = dev2;
    }

    function _create() internal returns (uint256 id) {
        vm.prank(pm);
        id = jar.createProject{value: DEPOSIT}(_devs(), FEE, keccak256("v0"));
    }

    function _change(uint256 id) internal {
        ChangeJar.Project memory p = jar.getProject(id);
        vm.prank(pm);
        if (p.deposit >= p.fee) {
            jar.submitChange(id, keccak256(abi.encode(p.version + 1)), "change");
        } else {
            jar.submitChange{value: p.fee}(id, keccak256(abi.encode(p.version + 1)), "change");
        }
    }

    // ---- 创建项目 ----

    function test_create_ok() public {
        uint256 id = _create();
        ChangeJar.Project memory p = jar.getProject(id);
        assertEq(p.pm, pm);
        assertEq(p.deposit, DEPOSIT);
        assertEq(p.jar, 0);
        assertEq(p.version, 0);
        assertEq(jar.getChanges(id).length, 1);
    }

    function test_create_reverts_depositBelowFee() public {
        vm.prank(pm);
        vm.expectRevert("deposit < fee");
        jar.createProject{value: FEE - 1}(_devs(), FEE, bytes32(0));
    }

    function test_create_reverts_feeZero() public {
        vm.prank(pm);
        vm.expectRevert("fee zero");
        jar.createProject{value: 1}(_devs(), 0, bytes32(0));
    }

    function test_create_reverts_noDevs() public {
        address[] memory none = new address[](0);
        vm.prank(pm);
        vm.expectRevert("devs count");
        jar.createProject{value: DEPOSIT}(none, FEE, bytes32(0));
    }

    function test_create_reverts_tooManyDevs() public {
        address[] memory many = new address[](11);
        for (uint256 i = 0; i < 11; i++) {
            many[i] = address(uint160(0x1000 + i));
        }
        vm.prank(pm);
        vm.expectRevert("devs count");
        jar.createProject{value: DEPOSIT}(many, FEE, bytes32(0));
    }

    function test_create_reverts_zeroDev() public {
        address[] memory d = new address[](1);
        d[0] = address(0);
        vm.prank(pm);
        vm.expectRevert("zero dev");
        jar.createProject{value: DEPOSIT}(d, FEE, bytes32(0));
    }

    function test_create_reverts_duplicateDev() public {
        address[] memory d = new address[](2);
        d[0] = dev1;
        d[1] = dev1;
        vm.prank(pm);
        vm.expectRevert("duplicate dev");
        jar.createProject{value: DEPOSIT}(d, FEE, bytes32(0));
    }

    function test_create_reverts_pmIsDev() public {
        address[] memory d = new address[](1);
        d[0] = pm;
        vm.prank(pm);
        vm.expectRevert("pm is dev");
        jar.createProject{value: DEPOSIT}(d, FEE, bytes32(0));
    }

    // ---- 提交变更单 ----

    function test_submit_fromDeposit() public {
        uint256 id = _create();
        _change(id);
        ChangeJar.Project memory p = jar.getProject(id);
        assertEq(p.deposit, DEPOSIT - FEE);
        assertEq(p.jar, FEE);
        assertEq(p.version, 1);
        ChangeJar.Change[] memory c = jar.getChanges(id);
        assertEq(c.length, 2);
        assertTrue(c[1].paidFromDeposit);
    }

    function test_submit_reverts_notPm() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert("not pm");
        jar.submitChange(id, bytes32(0), "x");
    }

    function test_submit_reverts_paymentWhenDepositEnough() public {
        uint256 id = _create();
        vm.prank(pm);
        vm.expectRevert("no payment needed");
        jar.submitChange{value: 1}(id, bytes32(0), "x");
    }

    function test_submit_reverts_noteTooLong() public {
        uint256 id = _create();
        bytes memory long = new bytes(141);
        for (uint256 i = 0; i < long.length; i++) {
            long[i] = "a";
        }
        vm.prank(pm);
        vm.expectRevert("note too long");
        jar.submitChange(id, bytes32(0), string(long));
    }

    function test_submit_depositExhaustedThenPayExact() public {
        uint256 id = _create();
        for (uint256 i = 0; i < 8; i++) {
            _change(id);
        }
        ChangeJar.Project memory p = jar.getProject(id);
        assertEq(p.deposit, 0);
        assertEq(p.jar, 8 * FEE);

        // 第 9 次必须现付，且必须恰好等于 fee
        vm.prank(pm);
        vm.expectRevert("pay exact fee");
        jar.submitChange(id, bytes32(0), "x");
        vm.prank(pm);
        vm.expectRevert("pay exact fee");
        jar.submitChange{value: FEE + 1}(id, bytes32(0), "x");

        _change(id);
        p = jar.getProject(id);
        assertEq(p.jar, 9 * FEE);
        assertEq(p.version, 9);
        assertFalse(jar.getChanges(id)[9].paidFromDeposit);
    }

    function test_submit_partialDepositNotTouchedWhenPaying() public {
        // 保证金 1.5 x fee：第 1 次从保证金扣，剩 0.5 x fee 不够，之后现付，剩余保证金不动
        vm.prank(pm);
        uint256 id = jar.createProject{value: (FEE * 3) / 2}(_devs(), FEE, bytes32(0));
        _change(id);
        _change(id);
        ChangeJar.Project memory p = jar.getProject(id);
        assertEq(p.deposit, FEE / 2);
        assertEq(p.jar, 2 * FEE);
    }

    // ---- 确认收到 ----

    function test_acknowledge_ok_and_reverts() public {
        uint256 id = _create();
        vm.prank(dev1);
        jar.acknowledge(id, 0);
        assertTrue(jar.acknowledged(id, dev1, 0));

        vm.prank(stranger);
        vm.expectRevert("not dev");
        jar.acknowledge(id, 0);

        vm.prank(dev1);
        vm.expectRevert("future version");
        jar.acknowledge(id, 1);
    }

    // ---- 上线 ----

    function test_launch_splitsAndRefunds() public {
        uint256 id = _create();
        _change(id);
        _change(id);
        _change(id);
        vm.prank(dev1);
        jar.launch(id);
        assertEq(jar.claimable(dev1), (3 * FEE) / 2);
        assertEq(jar.claimable(dev2), (3 * FEE) / 2);
        assertEq(jar.claimable(pm), DEPOSIT - 3 * FEE);
        assertEq(jar.getProject(id).status, 1);
    }

    function test_launch_pmCanLaunchSameResult() public {
        uint256 id = _create();
        _change(id);
        _change(id);
        vm.prank(pm);
        jar.launch(id);
        assertEq(jar.claimable(dev1), FEE);
        assertEq(jar.claimable(dev2), FEE);
        assertEq(jar.claimable(pm), DEPOSIT - 2 * FEE);
    }

    function test_launch_reverts_stranger() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert("not member");
        jar.launch(id);
    }

    function test_launch_zeroChanges_refundsAll() public {
        uint256 id = _create();
        vm.prank(dev1);
        jar.launch(id);
        assertEq(jar.claimable(pm), DEPOSIT);
        assertEq(jar.claimable(dev1), 0);
    }

    function test_launch_singleDevGetsAll() public {
        address[] memory d = new address[](1);
        d[0] = dev1;
        vm.prank(pm);
        uint256 id = jar.createProject{value: DEPOSIT}(d, FEE, bytes32(0));
        _change(id);
        _change(id);
        vm.prank(dev1);
        jar.launch(id);
        assertEq(jar.claimable(dev1), 2 * FEE);
    }

    function test_launch_dustGoesToPm() public {
        // 3 个开发、fee = 10 wei：罐 10 wei，每人 3，零头 1 给 PM
        address[] memory d = new address[](3);
        d[0] = dev1;
        d[1] = dev2;
        d[2] = address(0xD3);
        vm.prank(pm);
        uint256 id = jar.createProject{value: 100}(d, 10, bytes32(0));
        _change(id);
        vm.prank(dev1);
        jar.launch(id);
        assertEq(jar.claimable(dev1), 3);
        assertEq(jar.claimable(dev2), 3);
        assertEq(jar.claimable(address(0xD3)), 3);
        assertEq(jar.claimable(pm), 90 + 1);
    }

    function test_launch_twice_reverts() public {
        uint256 id = _create();
        vm.prank(dev1);
        jar.launch(id);
        vm.prank(dev1);
        vm.expectRevert("not active");
        jar.launch(id);
    }

    // ---- 取消 ----

    function test_cancel_zeroChanges() public {
        uint256 id = _create();
        vm.prank(pm);
        jar.cancel(id);
        assertEq(jar.claimable(pm), DEPOSIT);
        assertEq(jar.getProject(id).status, 2);
    }

    function test_cancel_reverts_afterChange() public {
        uint256 id = _create();
        _change(id);
        vm.prank(pm);
        vm.expectRevert("has changes");
        jar.cancel(id);
    }

    function test_cancel_reverts_notPm() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert("not pm");
        jar.cancel(id);
    }

    // ---- 上线或取消之后 ----

    function test_afterLaunch_everythingReverts() public {
        uint256 id = _create();
        _change(id);
        vm.prank(pm);
        jar.launch(id);

        vm.startPrank(pm);
        vm.expectRevert("not active");
        jar.submitChange(id, bytes32(0), "x");
        vm.expectRevert("not active");
        jar.cancel(id);
        vm.expectRevert("not active");
        jar.launch(id);
        vm.stopPrank();

        vm.prank(dev1);
        vm.expectRevert("not active");
        jar.acknowledge(id, 0);
    }

    function test_afterCancel_everythingReverts() public {
        uint256 id = _create();
        vm.startPrank(pm);
        jar.cancel(id);
        vm.expectRevert("not active");
        jar.submitChange(id, bytes32(0), "x");
        vm.expectRevert("not active");
        jar.launch(id);
        vm.stopPrank();
    }

    // ---- 领取 ----

    function test_withdraw_paysOwnOnly_andClears() public {
        uint256 id = _create();
        _change(id);
        _change(id);
        vm.prank(dev1);
        jar.launch(id);

        uint256 before = dev1.balance;
        vm.prank(dev1);
        jar.withdraw();
        assertEq(dev1.balance - before, FEE);
        assertEq(jar.claimable(dev1), 0);
        assertEq(jar.claimable(dev2), FEE);

        vm.prank(dev1);
        vm.expectRevert("nothing to claim");
        jar.withdraw();
    }

    function test_withdraw_rejectingDevDoesNotBlockOthers() public {
        RejectingDev bad = new RejectingDev();
        address[] memory d = new address[](2);
        d[0] = address(bad);
        d[1] = dev2;
        vm.prank(pm);
        uint256 id = jar.createProject{value: DEPOSIT}(d, FEE, bytes32(0));
        _change(id);
        _change(id);
        vm.prank(pm);
        jar.launch(id);

        // 坏地址领取失败，不影响其他人
        vm.expectRevert("transfer failed");
        bad.claim(jar);

        uint256 before = dev2.balance;
        vm.prank(dev2);
        jar.withdraw();
        assertEq(dev2.balance - before, FEE);
        vm.prank(pm);
        jar.withdraw();
    }

    function test_withdraw_reentrancyFails() public {
        ReentrantDev evil = new ReentrantDev(jar);
        address[] memory d = new address[](2);
        d[0] = address(evil);
        d[1] = dev2;
        vm.prank(pm);
        uint256 id = jar.createProject{value: DEPOSIT}(d, FEE, bytes32(0));
        _change(id);
        _change(id);
        vm.prank(pm);
        jar.launch(id);

        uint256 contractBalanceBefore = address(jar).balance;
        evil.claim();
        // 只收到一次分成
        assertEq(address(evil).balance, FEE);
        assertEq(contractBalanceBefore - address(jar).balance, FEE);
        assertEq(evil.attempts(), 1);
    }
}
