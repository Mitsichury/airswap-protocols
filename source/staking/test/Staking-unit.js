const { expect } = require('chai')
const timeMachine = require('ganache-time-traveler')
const { artifacts, ethers, waffle } = require('hardhat')
const BN = ethers.BigNumber
const { deployMockContract } = waffle
const IERC20 = artifacts.require('IERC20')

describe('Staking Unit', () => {
  let snapshotId
  let deployer
  let account1
  let account2
  let token
  let stakingFactory
  let staking
  const CLIFF = 10 //blocks
  const DURATION = 100 //blocks
  // every 1 block 1.00% is vested, user can only claim starting afater 10 blocks, or 10% vested

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot()
    snapshotId = snapshot['result']
  })

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId)
  })

  before(async () => {
    ;[deployer, account1, account2] = await ethers.getSigners()
    token = await deployMockContract(deployer, IERC20.abi)
    stakingFactory = await ethers.getContractFactory('Staking')
    staking = await stakingFactory.deploy(
      token.address,
      'Staked AST',
      'sAST',
      DURATION,
      CLIFF
    )
    await staking.deployed()
  })

  describe('Default Values', async () => {
    it('constructor sets default values', async () => {
      const owner = await staking.owner()
      const tokenAddress = await staking.token()
      const cliff = await staking.cliff()
      const duration = await staking.duration()

      expect(owner).to.equal(deployer.address)
      expect(tokenAddress).to.equal(token.address)
      expect(cliff).to.equal(CLIFF)
      expect(duration).to.equal(DURATION)
    })
  })

  describe('Set Vesting Schedule', async () => {
    it('non owner cannot set vesting schedule', async () => {
      await expect(
        staking.connect(account1).setSchedule(0, 0)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('owner can set vesting schedule', async () => {
      await staking.connect(deployer).setSchedule(2 * DURATION, CLIFF)

      const cliff = await staking.cliff()
      const duration = await staking.duration()
      expect(cliff).to.equal(CLIFF)
      expect(duration).to.equal(2 * DURATION)
    })
  })

  describe('Stake', async () => {
    it('successful staking', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stake('100')
      const block = await ethers.provider.getBlock()
      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(1)
      expect(userStakes[0].initial).to.equal(100)
      expect(userStakes[0].balance).to.equal(100)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].timestamp).to.equal(block.timestamp)
    })

    it('successful staking for', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stakeFor(account2.address, '170')
      const userStakes = await staking
        .connect(account1)
        .getStakes(account2.address)
      const block = await ethers.provider.getBlock()
      expect(userStakes.length).to.equal(1)
      expect(userStakes[0].initial).to.equal(170)
      expect(userStakes[0].balance).to.equal(170)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].duration).to.equal(DURATION)
      expect(userStakes[0].timestamp).to.equal(block.timestamp)
    })

    it('successful multiple stakes', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stake('100')
      const block0 = await ethers.provider.getBlock()
      await staking.connect(account1).stake('140')
      const block1 = await ethers.provider.getBlock()
      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(2)

      expect(userStakes[0].initial).to.equal(100)
      expect(userStakes[0].balance).to.equal(100)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].duration).to.equal(DURATION)
      expect(userStakes[0].timestamp).to.equal(block0.timestamp)

      expect(userStakes[1].initial).to.equal(140)
      expect(userStakes[1].balance).to.equal(140)
      expect(userStakes[1].cliff).to.equal(CLIFF)
      expect(userStakes[1].duration).to.equal(DURATION)
      expect(userStakes[1].timestamp).to.equal(block1.timestamp)
    })

    it('successful multiple stakes with an updated vesting schedule', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stake('100')
      const block0 = await ethers.provider.getBlock()
      await staking.connect(deployer).setSchedule(DURATION * 2, CLIFF)
      await staking.connect(account1).stake('140')
      const block1 = await ethers.provider.getBlock()

      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(2)

      expect(userStakes[0].initial).to.equal(100)
      expect(userStakes[0].balance).to.equal(100)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].duration).to.equal(DURATION)
      expect(userStakes[0].timestamp).to.equal(block0.timestamp)

      expect(userStakes[1].initial).to.equal(140)
      expect(userStakes[1].balance).to.equal(140)
      expect(userStakes[1].cliff).to.equal(CLIFF)
      expect(userStakes[1].duration).to.equal(DURATION * 2)
      expect(userStakes[1].timestamp).to.equal(block1.timestamp)
    })

    it('successful multiple stake fors', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stakeFor(account2.address, '100')
      const block0 = await ethers.provider.getBlock()
      await staking.connect(account1).stakeFor(account2.address, '140')
      const block1 = await ethers.provider.getBlock()
      const userStakes = await staking
        .connect(account1)
        .getStakes(account2.address)
      expect(userStakes.length).to.equal(2)

      expect(userStakes[0].initial).to.equal(100)
      expect(userStakes[0].balance).to.equal(100)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].duration).to.equal(DURATION)
      expect(userStakes[0].timestamp).to.equal(block0.timestamp)

      expect(userStakes[1].initial).to.equal(140)
      expect(userStakes[1].balance).to.equal(140)
      expect(userStakes[1].cliff).to.equal(CLIFF)
      expect(userStakes[1].duration).to.equal(DURATION)
      expect(userStakes[1].timestamp).to.equal(block1.timestamp)
    })

    it('unsuccessful staking', async () => {
      await token.mock.transferFrom.revertsWithReason('Insufficient Funds')
      await expect(staking.connect(account1).stake('100')).to.be.revertedWith(
        'Insufficient Funds'
      )
    })

    it('unsuccessful staking when amount is 0', async () => {
      await expect(staking.connect(account1).stake('0')).to.be.revertedWith(
        'AMOUNT_INVALID'
      )
    })

    it('unsuccessful add to stake when no stakes made', async () => {
      await token.mock.transferFrom.returns(true)
      await expect(staking.connect(account1).addToStake('0', '100')).to.be
        .reverted
    })

    it('successful add to stake stake has been made', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stake('100')
      const block = await ethers.provider.getBlock()
      await staking.connect(account1).addToStake('0', '120')

      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(1)

      expect(userStakes[0].initial).to.equal(220)
      expect(userStakes[0].balance).to.equal(220)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].duration).to.equal(DURATION)
      expect(userStakes[0].timestamp).to.equal(block.timestamp)
    })

    it('successful add to stake and timestamp updates to appropriate value', async () => {
      await token.mock.transferFrom.returns(true)
      await staking.connect(account1).stake('100')
      const block0 = await ethers.provider.getBlock()

      // move 100000 seconds forward
      await timeMachine.advanceBlockAndSetTime(block0.timestamp + 100000)

      const blockNewTime = await ethers.provider.getBlockNumber()
      const blockNewTimeInfo = await ethers.provider.getBlock(blockNewTime)
      await staking.connect(account1).addToStake('0', '120')

      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(1)

      expect(userStakes[0].initial).to.equal(220)
      expect(userStakes[0].balance).to.equal(220)
      expect(userStakes[0].cliff).to.equal(CLIFF)
      expect(userStakes[0].duration).to.equal(DURATION)

      // check if timestamp was updated appropriately
      const diff = BN.from(blockNewTimeInfo.timestamp).sub(block0.timestamp)
      const product = BN.from(120).mul(diff)
      const quotient = product.div(BN.from(220))
      // + 1 because number rounds up to nearest whole
      const sum = BN.from(block0.timestamp)
        .add(BN.from(quotient))
        .add(1)
      expect(userStakes[0].timestamp).to.equal(sum)
    })
  })

  describe('Unstake', async () => {
    it('unstaking fails when cliff has not passed', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      await expect(
        staking.connect(account1).unstake('0', '50')
      ).to.be.revertedWith('CLIFF_NOT_REACHED')
    })

    it('unstaking fails when attempting to claim more than is available', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')

      timeMachine.advanceTimeAndBlock(CLIFF)
      await expect(
        staking.connect(account1).unstake('0', '100')
      ).to.be.revertedWith('AMOUNT_EXCEEDS_AVAILABLE')
    })

    it('successful unstaking', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')

      // move 10 blocks forward - 10% vested
      for (let index = 0; index < 10; index++) {
        await timeMachine.advanceBlock()
      }

      await staking.connect(account1).unstake('0', '10')
      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(1)
      expect(userStakes[0].initial).to.equal(100)
      expect(userStakes[0].balance).to.equal(90)
    })

    it('successful unstaking with updated vesting schedule', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      await staking.connect(deployer).setSchedule(DURATION * 2, CLIFF)
      await staking.connect(account1).stake('100')

      // move 10 blocks forward - 20% vested for second stake
      for (let index = 0; index < 10; index++) {
        await timeMachine.advanceBlock()
      }

      await staking.connect(account1).unstake('1', '5')
      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(2)
      expect(userStakes[1].initial).to.equal(100)
      expect(userStakes[1].balance).to.equal(95)
    })

    it('successful unstaking and removal of stake', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      await staking.connect(account1).stake('200')
      const block0 = await ethers.provider.getBlock()
      await staking.connect(account1).stake('300')
      const block1 = await ethers.provider.getBlock()

      // move 100 blocks forward + 2 stakes = 102% vested
      for (let index = 0; index < 100; index++) {
        await timeMachine.advanceBlock()
      }

      await staking.connect(account1).unstake('0', '100')
      const userStakes = await staking
        .connect(account1)
        .getStakes(account1.address)
      expect(userStakes.length).to.equal(2)

      // ensure stake 0 was overwritten with last stake
      expect(userStakes[0].initial).to.equal(300)
      expect(userStakes[0].balance).to.equal(300)
      expect(userStakes[0].timestamp).to.equal(block1.timestamp)
      expect(userStakes[1].initial).to.equal(200)
      expect(userStakes[1].balance).to.equal(200)
      expect(userStakes[1].timestamp).to.equal(block0.timestamp)
    })
  })

  describe('Vested', async () => {
    it('vested amounts match expected amount per block', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')

      timeMachine.advanceTimeAndBlock(5)
      const vestedAmount = await staking.vested(account1.address, '0')
      expect(vestedAmount).to.equal('5')
    })

    it('vested amounts match expected amount per block with an updated vesting schedule', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(deployer).setSchedule(DURATION * 2, CLIFF)
      await staking.connect(account1).stake('100')

      timeMachine.advanceTimeAndBlock(20)
      const vestedAmount = await staking.vested(account1.address, '0')
      expect(vestedAmount).to.equal('10')
    })

    it('multiple vested amounts match expected amount per block', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      // 10% of first stake is unlocked
      for (let index = 0; index < CLIFF; index++) {
        await timeMachine.advanceBlock()
      }
      await staking.connect(account1).stake('160')
      // 13% of second stake is unlocked
      for (let index = 0; index < 13; index++) {
        await timeMachine.advanceBlock()
      }
      await staking.connect(account1).stake('170')
      // 3% of third stake is unlocked
      for (let index = 0; index < 3; index++) {
        await timeMachine.advanceBlock()
      }

      // every 1 block 1% is vested, user can only claim starting after 10 blocks, or 10% vested
      // 10 blocks + 1 stake + 13 blocks + 1 stake + 3 blocks = 28 total blocks passed for first stake
      // 13 blocks + 1 stake + 3 blocks = 17 total blocks passed for second stake
      // 3 blocks = 3 total blocks passed for third stake

      const vestedAmount1 = await staking.vested(account1.address, '0')
      const vestedAmount2 = await staking.vested(account1.address, '1')
      const vestedAmount3 = await staking.vested(account1.address, '2')
      expect(vestedAmount1).to.equal('28')
      expect(vestedAmount2).to.equal('27')
      expect(vestedAmount3).to.equal('5')
    })
  })

  describe('Available to unstake', async () => {
    it('available to unstake is 0, if cliff has not passed', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')

      timeMachine.advanceTimeAndBlock(CLIFF - 1)
      const availableToUnstake = await staking.availableToUnstake(
        account1.address,
        '0'
      )
      expect(availableToUnstake).to.equal('0')
    })

    it('available to unstake is 0, if cliff has not passed with an updated vesting schedule', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      await staking.connect(deployer).setSchedule(DURATION, CLIFF)
      await staking.connect(account1).stake('100')
      // move 1 block before cliff for second stake
      for (let index = 0; index < CLIFF - 1; index++) {
        await timeMachine.advanceBlock()
      }
      const availableToUnstake = await staking.availableToUnstake(
        account1.address,
        '1'
      )
      expect(availableToUnstake).to.equal('0')
    })

    it('available to unstake is > 0, if cliff has passed', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')

      timeMachine.advanceTimeAndBlock(CLIFF)
      const availableToUnstake = await staking.availableToUnstake(
        account1.address,
        '0'
      )
      // every 1 block 1% is vested, user can only claim starting afater 10 blocks, or 10% vested
      expect(availableToUnstake).to.equal('10')
    })

    it('available to unstake is > 0, if cliff has passed with an updated vesting schedule', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      await staking.connect(deployer).setSchedule(DURATION, CLIFF)
      await staking.connect(account1).stake('100')

      timeMachine.advanceTimeAndBlock(CLIFF)
      const availableToUnstake = await staking.availableToUnstake(
        account1.address,
        '1'
      )
      // every 1 block 2% is vested, user can only claim starting afater 10 blocks, or 20% vested
      expect(availableToUnstake).to.equal('10')
    })

    it('available to unstake with multiple stakes and varying passed cliffs', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      await staking.connect(account1).stake('100')
      // 10% of first stake is unlocked
      for (let index = 0; index < CLIFF; index++) {
        await timeMachine.advanceBlock()
      }
      await staking.connect(account1).stake('160')
      // 13% of second stake is unlocked
      for (let index = 0; index < 13; index++) {
        await timeMachine.advanceBlock()
      }
      await staking.connect(account1).stake('170')
      // 3% of third stake is unlocked
      for (let index = 0; index < 3; index++) {
        await timeMachine.advanceBlock()
      }

      // every 1 block 1% is vested, user can only claim starting after 10 blocks, or 10% vested
      // 10 blocks + 1 stake + 13 blocks + 1 stake + 3 blocks = 28 total blocks passed for first stake
      // 13 blocks + 1 stake + 3 blocks = 17 total blocks passed for second stake
      // 3 blocks = 3 total blocks passed for third stake

      const availableStake1 = await staking.availableToUnstake(
        account1.address,
        '0'
      )
      const availableStake2 = await staking.availableToUnstake(
        account1.address,
        '1'
      )
      const availableStake3 = await staking.availableToUnstake(
        account1.address,
        '2'
      )
      expect(availableStake1).to.equal('28')
      expect(availableStake2).to.equal('27')
      expect(availableStake3).to.equal('0')
    })
  })

  describe('Balance of all stakes', async () => {
    it('get balance of all stakes', async () => {
      await token.mock.transferFrom.returns(true)
      await token.mock.transfer.returns(true)
      // stake 400 over 4 blocks
      for (let index = 0; index < 4; index++) {
        await staking.connect(account1).stake('100')
      }
      const balance = await staking
        .connect(account1)
        .balanceOf(account1.address)
      expect(balance).to.equal('400')
    })
  })
})
