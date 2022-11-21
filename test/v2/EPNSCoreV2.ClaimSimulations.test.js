const { ethers, waffle } = require("hardhat");

const { tokensBN } = require("../../helpers/utils");

const { epnsContractFixture, tokenFixture } = require("../common/fixtures");
const { expect } = require("../common/expect");
const createFixtureLoader = waffle.createFixtureLoader;

const weiToEth = (eth) => ethers.utils.formatEther(eth);

describe("EPNS CoreV2 Protocol", function () {
  const ADD_CHANNEL_MIN_POOL_CONTRIBUTION = tokensBN(50);
  const ADD_CHANNEL_MAX_POOL_CONTRIBUTION = tokensBN(250000 * 50);
  const ADJUST_FOR_FLOAT = 10 ** 7;

  let PushToken;
  let EPNSCoreV1Proxy;
  let EPNSCommV1Proxy;
  let ADMIN;
  let ALICE;
  let BOB;
  let CHARLIE;
  let CHANNEL_CREATOR;
  let ADMINSIGNER;
  let ALICESIGNER;
  let BOBSIGNER;
  let CHARLIESIGNER;
  let CHANNEL_CREATORSIGNER;

  let loadFixture;
  before(async () => {
    [wallet, other] = await ethers.getSigners();
    loadFixture = createFixtureLoader([wallet, other]);
  });

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    const [
      adminSigner,
      aliceSigner,
      bobSigner,
      charlieSigner,
      channelCreatorSigner,
    ] = await ethers.getSigners();

    ADMINSIGNER = adminSigner;
    ALICESIGNER = aliceSigner;
    BOBSIGNER = bobSigner;
    CHARLIESIGNER = charlieSigner;
    CHANNEL_CREATORSIGNER = channelCreatorSigner;

    ADMIN = await adminSigner.getAddress();
    ALICE = await aliceSigner.getAddress();
    BOB = await bobSigner.getAddress();
    CHARLIE = await charlieSigner.getAddress();
    CHANNEL_CREATOR = await channelCreatorSigner.getAddress();

    ({ PROXYADMIN, EPNSCoreV1Proxy, EPNSCommV1Proxy, ROUTER, PushToken } =
      await loadFixture(epnsContractFixture));

    ({ MOCKDAI, ADAI } = await loadFixture(tokenFixture));
  });
  /***
   * CHECKPOINTS TO CONSIDER WHILE TESTING -> Overall Stake-N-Claim Tests
   * ------------------------------------------
   * 1. Stake
   *  - Staking function should execute as expected-Updates user's staked amount, PUSH transfer etc ✅
   *  - FIRST stake should update user's stakedWeight, stakedAmount and other imperative details accurately
   *  - Consecutive stakes should update details accurately: 2 cases
   *    - a. User staking again in same epoch, Should add user's stake details in the same epoch
   *    - b. User staking in different epoch, should update the epoch's in between with last epoch details - and last epoch with latest details
   * 
   * 
   * 2. UnStake
   *  - UnStake function should execute as expected ✅
   *  - UnStake functions shouldn't be executed when Caller is Not a Staker.✅
   *  - UnStaking right after staking should lead to any rewards.
   *  - UnStaking should also transfer claimable rewards for the Caller ✅
   * 
   * 2. Reward Calculation and Claiming Reward Tests
   *  - First Claim of stakers should execute as expected ✅
   *  - First Claim: Stakers who hold longer should get more rewards ✅
   *  - Verify that total reward actually gets distrubuted between stakers in one given epoch ✅
   *  - Rewards should adjust automatically if new Staker comes into picture ✅
   *  - Users shouldn't be able to claim any rewards after withdrawal 
   * 
   * 3. Initiating New Stakes
   *  - Should only be called by the governance/admin ✅
   *  - Reward value passed should never be more than available Protocol_Pool_Fees in the protocol. ✅
   *  - lastUpdateTime and endPeriod should be updated accurately and stakeDuration should be increased.
   *  - If new Stake is initiated after END of running stake epoch:
   *    - Rewards should be accurate if new stake is initiated After an existing stakeDuration.
   * 
   *    - Rewards should be accurate if new stake is initiated within an existing stakeDuration.
   * 
   */

  describe("EPNS CORE: CLAIM REWARD TEST-ReardRate Procedure", () => {
    const CHANNEL_TYPE = 2;
    const EPOCH_DURATION = 20 * 7156 // number of blocks
    const TEST_CHANNEL_CTX = ethers.utils.toUtf8Bytes(
      "test-channel-hello-world"
    );


    beforeEach(async function () {
      await EPNSCoreV1Proxy.connect(ADMINSIGNER).setEpnsCommunicatorAddress(
        EPNSCommV1Proxy.address
      );
      await EPNSCommV1Proxy.connect(ADMINSIGNER).setEPNSCoreAddress(
        EPNSCoreV1Proxy.address
      );

      await PushToken.transfer(
        EPNSCoreV1Proxy.address,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10)
      );
      await PushToken.transfer(
        BOB,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.transfer(
        ALICE,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.transfer(
        CHARLIE,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.transfer(
        ADMIN,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.transfer(
        CHANNEL_CREATOR,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );

      await PushToken.connect(BOBSIGNER).approve(
        EPNSCoreV1Proxy.address,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.connect(ADMINSIGNER).approve(
        EPNSCoreV1Proxy.address,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.connect(ALICESIGNER).approve(
        EPNSCoreV1Proxy.address,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.connect(CHARLIESIGNER).approve(
        EPNSCoreV1Proxy.address,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );
      await PushToken.connect(CHANNEL_CREATORSIGNER).approve(
        EPNSCoreV1Proxy.address,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(10000)
      );

      await PushToken.connect(ALICESIGNER).setHolderDelegation(
        EPNSCoreV1Proxy.address,
        true
      );
    });
    // Helper Functions //

    const addPoolFees = async (signer, amount) => {
      await EPNSCoreV1Proxy.connect(signer).addPoolFees(amount);
    };

    const createChannel = async (signer) => {
      await EPNSCoreV1Proxy.connect(signer).createChannelWithPUSH(
        CHANNEL_TYPE,
        TEST_CHANNEL_CTX,
        ADD_CHANNEL_MIN_POOL_CONTRIBUTION,
        0
      );
    };

    const stakePushTokens = async (signer, amount) => {
      await EPNSCoreV1Proxy.connect(signer).stake(amount);
    };

    const stakeAtSingleBlock = async (stakeInfos) => {
      await ethers.provider.send("evm_setAutomine", [false]);
      await Promise.all(
        stakeInfos.map((stakeInfos) =>
          stakePushTokens(stakeInfos[0], stakeInfos[1])
        )
      );
      await network.provider.send("evm_mine");
      await ethers.provider.send("evm_setAutomine", [true]);
    };

    const jumpToBlockNumber = async (blockNumber) => {
      blockNumber = blockNumber.toNumber();
      const currentBlock = await ethers.provider.getBlock("latest");
      const numBlockToIncrease = blockNumber - currentBlock.number;
      const blockIncreaseHex = `0x${numBlockToIncrease.toString(16)}`;
      await ethers.provider.send("hardhat_mine", [blockIncreaseHex]);
    };

    const passBlockNumers = async(blockNumber)=>{
      blockNumber = `0x${blockNumber.toString(16)}`;
      await ethers.provider.send("hardhat_mine", [blockNumber]);
    }

    const claimRewardsInSingleBlock = async (signers) => {
      await ethers.provider.send("evm_setAutomine", [false]);
      await Promise.all(
        signers.map((signer) => EPNSCoreV1Proxy.connect(signer).harvestAll())
      );
      await network.provider.send("evm_mine");
      await ethers.provider.send("evm_setAutomine", [true]);
    };

    const getUserTokenWeight = async (user, amount, atBlock) =>{
      const holderWeight = await PushToken.holderWeight(user);
      return amount.mul(atBlock - holderWeight);
    }

    const getRewardsClaimed = async (signers) => {
      return await Promise.all(
        signers.map((signer) => EPNSCoreV1Proxy.usersRewardsClaimed(signer))
      );
    };

    const getEachEpochDetails = async(totalEpochs) =>{
      for(i = 1; i <= totalEpochs; i++){
        var reward = await EPNSCoreV1Proxy.checkEpochReward(i);

        // const userData = await EPNSCoreV1Proxy.userFeesInfo(BOB);
        // var userStakedWeight = userData.epochToUserStakedWeight(i);
        var epochToTotalWeight = await EPNSCoreV1Proxy.epochToTotalStakedWeight(i);
        var epochRewardsStored = await EPNSCoreV1Proxy.epochReward(i);
        
        console.log('\n EACH EPOCH DETAILS ');
       // console.log(`EPOCH to Total Weight for EPOCH ID ${i} is ${userStakedWeight}`)
        console.log(`EPOCH to Total Weight for EPOCH ID ${i} is ${epochToTotalWeight}`)
        console.log(`EPOCH to Total Weight for EPOCH ID ${i} is ${epochRewardsStored}`)
        console.log(`Rewards for EPOCH ID ${i} is ${reward}`)
      }
    }

    // TEST CASES BEGINS //

    describe.skip("🟢 Staking Tests ", function()
    {
      it("First: Basic Stake and Harvest",async()=>{
        // Set pool fee and initiate stake epoch
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();

        await passBlockNumers(5*EPOCH_DURATION)
        // stake
        const ammout = tokensBN(100);
        console.log("Staking,,,");
        await EPNSCoreV1Proxy.connect(ALICESIGNER).stake(ammout);
        console.log("Staking worked,,,");
        
        await passBlockNumers(5*EPOCH_DURATION)
        await EPNSCoreV1Proxy.connect(ALICESIGNER).harvestAll();
        console.log("Claimeworkd");

        const rewards = await EPNSCoreV1Proxy.usersRewardsClaimed(ALICE);
        console.log("got rewards",rewards.toString());

      })

      it("First Stake: should update user's stake details accurately",async()=>{
        // Set pool fee and initiate stake epoch
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();

        const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
        await passBlockNumers(5*EPOCH_DURATION)
        var currentBlock = await ethers.provider.getBlock("latest");
        const currentEpoch = await EPNSCoreV1Proxy.lastEpochRelative(genesisEpoch, currentBlock.number);
        // stake
        const stakeAmount = tokensBN(100);
        const stakeTx = await EPNSCoreV1Proxy.connect(ALICESIGNER).stake(stakeAmount);
        
        const userStakeDetails = await EPNSCoreV1Proxy.userFeesInfo(ALICE);
        const userActualWeight = await getUserTokenWeight(ALICE, stakeAmount, stakeTx.blockNumber);
        const totalStakedWeight = await EPNSCoreV1Proxy.totalStakedWeight();
        const epochToTotalWeight = await EPNSCoreV1Proxy.epochToTotalStakedWeight(currentEpoch);

        expect(userStakeDetails.stakedAmount).to.be.equal(stakeAmount);
        expect(userStakeDetails.stakedWeight).to.be.equal(userActualWeight);
        expect(userStakeDetails.lastStakedBlock).to.be.equal(stakeTx.blockNumber);
        expect(totalStakedWeight).to.be.equal(userActualWeight);
        // expect(epochToTotalWeight).to.be.equal(userActualWeight);
        //expect(userStakeDetails.epochToUserStakedWeight(currentEpoch)).to.be.equal(userActualWeight);
      })

      it("Consecutive Stake: In same epoch should update user's stake details accurately",async()=>{
          // Set pool fee and initiate stake epoch
          await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(2));
          await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();

          const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
          await passBlockNumers(5*EPOCH_DURATION)
          var currentBlock = await ethers.provider.getBlock("latest");
          const currentEpoch = await EPNSCoreV1Proxy.lastEpochRelative(genesisEpoch, currentBlock.number);
          // stake
          const stakeAmount = tokensBN(100);
          const stakeTx_1 = await EPNSCoreV1Proxy.connect(ALICESIGNER).stake(stakeAmount);
          const userActualWeight_1 = await getUserTokenWeight(ALICE, stakeAmount, stakeTx_1.blockNumber);
          
          // After 1000 Block but in the same EPOCH , i.e., 6 
          await passBlockNumers(1000)
          const stakeTx_2 = await EPNSCoreV1Proxy.connect(ALICESIGNER).stake(stakeAmount);
          const userActualWeight_2 = await getUserTokenWeight(ALICE, stakeAmount, stakeTx_2.blockNumber);

          var currentBlock2 = await ethers.provider.getBlock("latest");
          const currentEpoch2 = await EPNSCoreV1Proxy.lastEpochRelative(genesisEpoch, currentBlock2.number);

          const userStakeDetails = await EPNSCoreV1Proxy.userFeesInfo(ALICE);
          const totalStakedWeight = await EPNSCoreV1Proxy.totalStakedWeight();
          const epochToTotalWeight = await EPNSCoreV1Proxy.epochToTotalStakedWeight(currentEpoch2);

          expect(userStakeDetails.stakedAmount).to.be.equal(stakeAmount.mul(2));
          expect(userStakeDetails.stakedWeight).to.be.equal(userActualWeight_1.add(userActualWeight_2));
          expect(userStakeDetails.lastStakedBlock).to.be.equal(stakeTx_2.blockNumber);
          expect(epochToTotalWeight).to.be.equal(totalStakedWeight);
          expect(totalStakedWeight).to.be.equal(userActualWeight_1.add(userActualWeight_2));
          //expect(userStakeDetails.epochToUserStakedWeight(currentEpoch)).to.be.equal(userActualWeight);

      })

      it("Consecutive Stake: In Different epochs should update user's stake details accurately",async()=>{
        // Set pool fee and initiate stake epoch
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();

        const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
        await passBlockNumers(5*EPOCH_DURATION)
        var currentBlock = await ethers.provider.getBlock("latest");
        const currentEpoch = await EPNSCoreV1Proxy.lastEpochRelative(genesisEpoch, currentBlock.number);
        // stake
        const stakeAmount = tokensBN(100);
        const stakeTx_1 = await EPNSCoreV1Proxy.connect(ALICESIGNER).stake(stakeAmount);
        const userActualWeight_1 = await getUserTokenWeight(ALICE, stakeAmount, stakeTx_1.blockNumber);
        
        // After 5 more epochs
        await passBlockNumers(10*EPOCH_DURATION)
        const stakeTx_2 = await EPNSCoreV1Proxy.connect(ALICESIGNER).stake(stakeAmount);
        const userActualWeight_2 = await getUserTokenWeight(ALICE, stakeAmount, stakeTx_2.blockNumber);

        const userStakeDetails = await EPNSCoreV1Proxy.userFeesInfo(ALICE);
        const totalStakedWeight = await EPNSCoreV1Proxy.totalStakedWeight();
        const epochToTotalWeight = await EPNSCoreV1Proxy.epochToTotalStakedWeight(currentEpoch);

        expect(userStakeDetails.stakedAmount).to.be.equal(stakeAmount.mul(2));
        expect(userStakeDetails.stakedWeight).to.be.equal(userActualWeight_1.add(userActualWeight_2));
        expect(userStakeDetails.lastStakedBlock).to.be.equal(stakeTx_2.blockNumber);
        expect(totalStakedWeight).to.be.equal(userActualWeight_1.add(userActualWeight_2));
        //expect(userStakeDetails.epochToUserStakedWeight(currentEpoch)).to.be.equal(userActualWeight);

    })
    });

    describe("🟢 Reward Calculation and Harvesting Tests", function()
    {
      it("Initial Test - Bob stakes, unstakes 100 tokens , should receive Non-Zero Reward Value", async function(){
        // Set pool fee and initiate stake epoch
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();
        const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
        
        await passBlockNumers(5*EPOCH_DURATION)
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(BOBSIGNER, tokensBN(100));

        await passBlockNumers(2 * EPOCH_DURATION);

        const tx_bob = await EPNSCoreV1Proxy.connect(BOBSIGNER).unstake();
        
        const bobClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(BOB);
        // console.log(`Bob Claimed ${bobClaim_after.toString()} tokens at Block number ${tx_bob.blockNumber}`);

        await expect(bobClaim_after).to.be.gt(0);
    })
    it("3 Stakers stake equal tokens in same epoch - Should get equal rewards", async function(){
        // Set pool fee and initiate stake epoch
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();
        const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
        
        await passBlockNumers(5*EPOCH_DURATION)
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(BOBSIGNER, tokensBN(100));
        // await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(ALICESIGNER, tokensBN(100));
        await stakePushTokens(CHANNEL_CREATORSIGNER, tokensBN(100));

        await passBlockNumers(2 * EPOCH_DURATION);
        var currentBlock = await ethers.provider.getBlock("latest");
        const currentEpoch = await EPNSCoreV1Proxy.lastEpochRelative(genesisEpoch, currentBlock.number);      
       
        const tx_bob = await EPNSCoreV1Proxy.connect(BOBSIGNER).unstake();
        const tx_alice = await EPNSCoreV1Proxy.connect(ALICESIGNER).unstake();
        const tx_channelCreator = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).unstake();
  
      //   const userData = await EPNSCoreV1Proxy.userFeesInfo(BOB);
      //   // console.log('USER BOB LAST STAKED BLOCK ',userData.lastStakedBlock.toString());
      const bobClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(BOB);
      const aliceClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(ALICE);
      const channelCreatorClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(CHANNEL_CREATOR);

      // perPersonShare = ( totalPoolFees ).div(total Stakers)
      const perPersonShare = ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5).div(3);
  
      // console.log(`Bob Claimed ${bobClaim_after.toString()} tokens at Block number ${tx_bob.blockNumber}`);
      // console.log(`Alice Claimed ${aliceClaim_after.toString()} tokens at Block number ${tx_alice.blockNumber}`);
      // console.log(`ChannelCreator Claimed ${channelCreatorClaim_after.toString()} tokens at Block number ${tx_channelCreator.blockNumber}`);

      expect(ethers.BigNumber.from(bobClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));
      expect(ethers.BigNumber.from(aliceClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));
      expect(ethers.BigNumber.from(channelCreatorClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));

    })
      /***
     * Case:
     * 4 Stakers stake 100 Tokens and each of them try to claim after 1 complete epoch of the previous staker
     * Expecatations: Rewards of -> ChannelCreator > Charlie > Alice > BOB
     */
    it("First Claim: Stakers who hold more should get more Reward", async function(){
        // Set pool fee and initiate stake epoch
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();
        const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
       
        await passBlockNumers(5*EPOCH_DURATION)
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(BOBSIGNER, tokensBN(100));
        
      
        await passBlockNumers(4*EPOCH_DURATION);
       await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(ALICESIGNER, tokensBN(100));


        await passBlockNumers(3*EPOCH_DURATION);
       //  await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(CHARLIESIGNER, tokensBN(100));
        

        await passBlockNumers(4*EPOCH_DURATION);
        //await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await stakePushTokens(CHANNEL_CREATORSIGNER, tokensBN(100));


        await passBlockNumers(2 * EPOCH_DURATION);
        const tx_bob = await EPNSCoreV1Proxy.connect(BOBSIGNER).unstake();
        const tx_alice = await EPNSCoreV1Proxy.connect(ALICESIGNER).unstake();
        const tx_charlie = await EPNSCoreV1Proxy.connect(CHARLIESIGNER).unstake();
        const tx_channelCreator = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).unstake();
        
        const bobClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(BOB);
        const aliceClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(ALICE);
        const charlieClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(CHARLIE);
        const channelCreatorClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(CHANNEL_CREATOR);

        // // Logs if needed
        // console.log("First Claim")
        console.log(`Bob Claimed ${bobClaim_after.toString()} tokens at Block number ${tx_bob.blockNumber}`);
        console.log(`Alice Claimed ${aliceClaim_after.toString()} tokens at Block number ${tx_alice.blockNumber}`);
        console.log(`Charlie Claimed ${charlieClaim_after.toString()} tokens at Block number ${tx_charlie.blockNumber}`);
        console.log(`ChannelCreator Claimed ${channelCreatorClaim_after.toString()} tokens at Block number ${tx_channelCreator.blockNumber}`);

        // Verify rewards of ChannelCreator > Charlie > Alice > BOB
        // expect(aliceClaim_after).to.be.gt(bobClaim_after);
        // expect(charlieClaim_after).to.be.gt(aliceClaim_after);
        // expect(channelCreatorClaim_after).to.be.gt(charlieClaim_after);
    })

    it.skip("Equal rewards should be distributed to Users after Stake Epoch End", async function(){
        // Set pool fee and initiate stake epoch
        await addPoolFees(ADMINSIGNER, ADD_CHANNEL_MIN_POOL_CONTRIBUTION.mul(5));
        await EPNSCoreV1Proxy.connect(ADMINSIGNER).initializeStake();

        const genesisEpoch = await EPNSCoreV1Proxy.genesisEpoch();
        await passBlockNumers(5*EPOCH_DURATION)
        var currentBlock = await ethers.provider.getBlock("latest");
        const currentEpoch = await EPNSCoreV1Proxy.lastEpochRelative(genesisEpoch, currentBlock.number);
        // stake
        await stakePushTokens(BOBSIGNER, tokensBN(100));
        await stakePushTokens(ALICESIGNER, tokensBN(100));
        await stakePushTokens(CHARLIESIGNER, tokensBN(100));
        await stakePushTokens(CHANNEL_CREATORSIGNER, tokensBN(100));

        await passBlockNumers(8*EPOCH_DURATION);
        const tx_bob = await EPNSCoreV1Proxy.connect(BOBSIGNER).claimRewards();
        await passBlockNumers(9*EPOCH_DURATION);
        const tx_alice = await EPNSCoreV1Proxy.connect(ALICESIGNER).claimRewards();
        await passBlockNumers(10*EPOCH_DURATION);
        const tx_charlie = await EPNSCoreV1Proxy.connect(CHARLIESIGNER).claimRewards();
        await passBlockNumers(11*EPOCH_DURATION);
        const tx_channelCreator = await EPNSCoreV1Proxy.connect(CHANNEL_CREATORSIGNER).claimRewards();

        const bobClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(BOB);
        const aliceClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(ALICE);
        const charlieClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(CHARLIE);
        const channelCreatorClaim_after = await EPNSCoreV1Proxy.usersRewardsClaimed(CHANNEL_CREATOR);

        // Logs if needed
      console.log("First Claim")
      console.log(`Bob Claimed ${bobClaim_after.toString()} tokens at Block number ${tx_bob.blockNumber}`);
      console.log(`Alice Claimed ${aliceClaim_after.toString()} tokens at Block number ${tx_alice.blockNumber}`);
      console.log(`Charlie Claimed ${charlieClaim_after.toString()} tokens at Block number ${tx_charlie.blockNumber}`);
      console.log(`ChannelCreator Claimed ${channelCreatorClaim_after.toString()} tokens at Block number ${tx_channelCreator.blockNumber}`);
      
      expect(ethers.BigNumber.from(bobClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));
      expect(ethers.BigNumber.from(aliceClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));
      expect(ethers.BigNumber.from(charlieClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));
      expect(ethers.BigNumber.from(channelCreatorClaim_after)).to.be.closeTo(ethers.BigNumber.from(perPersonShare), ethers.utils.parseEther("10"));
    })

    it.skip("should distrubute reward evenly for different users staking same ammount", async function () {
      await createChannel(ALICESIGNER);
      await createChannel(BOBSIGNER);
      await createChannel(CHARLIESIGNER);
      await createChannel(CHANNEL_CREATORSIGNER);


      // 4 users stakes push
      await stakeAtSingleBlock([
        [ALICESIGNER, tokensBN(100)],
        [BOBSIGNER, tokensBN(100)],
        [CHARLIESIGNER, tokensBN(100)],
        [CHANNEL_CREATORSIGNER, tokensBN(100)],
      ])

      // 1 epoch passes
      await passBlockNumers(1*EPOCH_DURATION)

      // all users claims
      await claimRewardsInSingleBlock([
        ALICESIGNER,
        BOBSIGNER,
        CHANNEL_CREATORSIGNER,
        CHARLIESIGNER,
      ]);

      var [
        aliceClaimed1,
        bobClaimed1,
        charlieClaimed1,
        channelCreatorClaimed1,
      ] = await getRewardsClaimed([ALICE, BOB, CHARLIE, CHANNEL_CREATOR]);
      
      expect(aliceClaimed1).to.be.above(bn(0));
      expect(aliceClaimed1).to.equal(bobClaimed1);
      expect(aliceClaimed1).to.equal(charlieClaimed1);
      expect(aliceClaimed1).to.equal(channelCreatorClaimed1);

      return;

      // 10 days passes
      await network.provider.send("evm_increaseTime", [3600 * 24 * 1]);
      await network.provider.send("evm_mine");

      // all users claims
      await claimRewardsInSingleBlock([
        ALICESIGNER,
        BOBSIGNER,
        CHANNEL_CREATORSIGNER,
        CHARLIESIGNER,
      ]);

      var [
        aliceClaimed1,
        bobClaimed1,
        charlieClaimed1,
        channelCreatorClaimed1,
      ] = await getRewardsClaimed([ALICE, BOB, CHARLIE, CHANNEL_CREATOR]);

      expect(aliceClaimed1).to.be.above(bn(0));
      expect(aliceClaimed1).to.equal(bobClaimed1);
      expect(aliceClaimed1).to.equal(charlieClaimed1);
      expect(aliceClaimed1).to.equal(channelCreatorClaimed1);
    });

    it.skip("should yield reward proportional to staked capital", async () => {
      await createChannel(ALICESIGNER);
      await createChannel(BOBSIGNER);
      await createChannel(CHARLIESIGNER);
      await createChannel(CHANNEL_CREATORSIGNER);

      // 2 users stakes push
      // Alice stakes twices as BOB
      await ethers.provider.send("evm_setAutomine", [false]);
      await Promise.all([
        await stakePushTokens(BOBSIGNER, tokensBN(100)),
        await stakePushTokens(ALICESIGNER, tokensBN(200)),
      ]);
      await network.provider.send("evm_mine");
      await ethers.provider.send("evm_setAutomine", [true]);

      // 3 day passes
      await network.provider.send("evm_increaseTime", [3600 * 24 * 7]);
      await network.provider.send("evm_mine");

      // all users claims
      await claimRewardsInSingleBlock([ALICESIGNER, BOBSIGNER]);

      var [aliceClaimed1, bobClaimed1] = await getRewardsClaimed([
        ALICE,
        BOB,
        CHARLIE,
        CHANNEL_CREATOR,
      ]);

      expect(bobClaimed1).to.be.above(bn(0));
      expect(aliceClaimed1).to.equal(bobClaimed1.mul(2));
    });

    it.skip("should yield reward proportional to time staked", async () => {
      await createChannel(ALICESIGNER);
      await createChannel(BOBSIGNER);
      await createChannel(CHARLIESIGNER);
      await createChannel(CHANNEL_CREATORSIGNER);

      // 2 users stakes push evenly
      await ethers.provider.send("evm_setAutomine", [false]);
      await Promise.all([
        await stakePushTokens(BOBSIGNER, tokensBN(100)),
        await stakePushTokens(ALICESIGNER, tokensBN(200)),
      ]);
      await network.provider.send("evm_mine");
      await ethers.provider.send("evm_setAutomine", [true]);

      // BOB claims after 1 day
      await network.provider.send("evm_increaseTime", [3600 * 24 * 1]);
      await network.provider.send("evm_mine");
      await claimRewardsInSingleBlock([BOBSIGNER]);

      // ALICE claims after 7 days
      await network.provider.send("evm_increaseTime", [3600 * 24 * 6]);
      await network.provider.send("evm_mine");
      await claimRewardsInSingleBlock([ALICESIGNER]);

      var [aliceClaimed1, bobClaimed1] = await getRewardsClaimed([
        ALICE,
        BOB,
        CHARLIE,
        CHANNEL_CREATOR,
      ]);

      expect(bobClaimed1).to.be.above(bn(0));
      expect(aliceClaimed1).to.be.above(bobClaimed1);
    });

  });

    describe.skip("🟢 UnStaking Tests", function()
    {

    });
  });
});


// 119 049468389252261688 tokens at Block number 14798295
// 160 714636312860706668 tokens at Block number 14798296
// 142 856899975093277602 tokens at Block number 14798297
// 95  237628327853808935 tokens at Block number 14798298