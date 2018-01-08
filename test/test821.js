/**
 * Ported over from zeppelin-solidity tests for NonFungibleland.sol
 *
 * Given that the test is mostly for common functionality, it should work mostly as-is.
 *
 * Deleted functionality: `burn`
 */
import assertRevert from './helpers/assertRevert';
const BigNumber = web3.BigNumber;

const LANDRegistry = artifacts.require('LANDRegistry');
const LANDProxy = artifacts.require('LANDProxy');

const NONE = '0x0000000000000000000000000000000000000000';

function checkTransferLog(log, parcelId, from, to) {
  log.event.should.be.eq('Transfer');
  log.args.parcelId.should.be.bignumber.equal(parcelId);
  log.args.from.should.be.equal(from);
  log.args.to.should.be.equal(to);
}

function checkApproveLog(log, parcelId, from, to) {
  log.event.should.be.eq('Approve');
  log.args.parcelId.should.be.bignumber.equal(parcelId);
  log.args.owner.should.be.equal(from);
  log.args.beneficiary.should.be.equal(to);
}

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('LANDRegistry', (accounts) => {
  const [creator, user, anotherUser, operator, mallory] = accounts
  let registry = null, proxy = null;
  let land = null;
  const _name = 'Decentraland LAND';
  const _symbol = 'LAND';
  const _firstParcelId = 1;
  const _secondParcelId = 2;
  const _unknownParcelId = 3;

  beforeEach(async function () {
    proxy = await LANDProxy.new({ gas: 4e7, gasPrice: 21e9, from: creator })
    registry = await LANDRegistry.new({ gas: 6e7, gasPrice: 21e9, from: creator })
    await proxy.upgrade(registry.address, '', { from: creator })
    land = await LANDRegistry.at(proxy.address)
    await land.assignNewParcel(0, 1, user, { from: creator });
    await land.assignNewParcel(0, 2, anotherUser, { from: creator });
  });

  describe('name', function () {
    it('has a name', async function () {
      const name = await land.name();
      name.should.be.equal(_name);
    });
  });

  describe('symbol', function () {
    it('has a symbol', async function () {
      const symbol = await registry.symbol();
      symbol.should.be.equal(_symbol);
    });
  });

  describe('totalSupply', function () {
    it('has a total supply equivalent to the inital supply', async function () {
      const totalSupply = await registry.totalSupply();
      totalSupply.should.be.bignumber.equal(2);
    });
    it('has a total supply that increases after creating a new land', async function () {
      let totalSupply = await registry.totalSupply();
      totalSupply.should.be.bignumber.equal(2);
      await land.assignNewParcel(-123, 3423, anotherUser, { from: creator });
      totalSupply = await registry.totalSupply();
      totalSupply.should.be.bignumber.equal(3);
    });
  });

  describe('assetsCount', function () {
    describe('when the given address owns some lands', function () {
      it('returns the amount of lands owned by the given address', async function () {
        const balance = await registry.assetsCount(user);
        balance.should.be.bignumber.equal(1);
      });
    });

    describe('when the given address owns some lands', function () {
      it('returns 0', async function () {
        const balance = await registry.assetsCount(user);
        balance.should.be.bignumber.equal(0);
      });
    });
  });

  describe('ownerOf', function () {
    describe('when the given land ID was tracked by this land', function () {
      const parcelId = _firstParcelId;

      it('returns the owner of the given land ID', async function () {
        const owner = await registry.ownerOf(parcelId);
        owner.should.be.equal(creator);
      });
    });

    describe('when the given land ID was not tracked by this land', function () {
      const parcelId = _unknownParcelId;

      it('returns 0', async function () {
        const owner = await registry.ownerOf(parcelId);
        owner.should.be.equal(NONE);
      });
    });
  });

  describe('assetByIndex', function () {
    describe('when the given address owns some lands', function () {
      const owner = creator;

      describe('when the given index is lower than the amount of lands owned by the given address', function () {
        const index = 0;

        it('returns the land ID placed at the given index', async function () {
          const parcelId = await registry.assetByIndex(owner, index);
          parcelId.should.be.bignumber.equal(_firstParcelId);
        });
      });

      describe('when the index is greater than or equal to the total lands owned by the given address', function () {
        const index = 2;

        it('reverts', async function () {
          await assertRevert(registry.assetByIndex(owner, index));
        });
      });
    });

    describe('when the given address does not own any land', function () {
      const owner = user;

      it('reverts', async function () {
        await assertRevert(registry.assetByIndex(owner, 0));
      });
    });
  });

  describe('create', function () {
    describe('when the given land ID was not tracked by this contract', function () {
      const parcelId = _unknownParcelId;

      describe('when the given address is not the zero address', function () {
        const to = user;

        it('create the given land ID to the given address', async function () {
          const previousBalance = await registry.assetsCount(to);

          await land.assignNewParcel(0, parcelId, to, { from: _creator });

          const owner = await registry.ownerOf(parcelId);
          owner.should.be.equal(to);

          const balance = await registry.assetsCount(to);
          balance.should.be.bignumber.equal(previousBalance + 1);
        });

        it('adds that land to the land list of the owner', async function () {
          await land.assignNewParcel(0, parcelId, to, { from: _creator });

          const lands = await registry.landsOf(to);
          lands.length.should.be.equal(1);
          lands[0].should.be.bignumber.equal(parcelId);

          const addedland = await registry.assetByIndex(to, 0);
          addedland.should.be.bignumber.equal(parcelId);
        });

        it('emits a transfer event', async function () {
          const { logs } = await land.create(0, parcelId, to);

          logs.length.should.be.equal(1);
          checkTransferLog(logs[0], parcelId, NONE, to);
        });
      });

      describe('when the given address is the zero address', function () {
        const to = 0x0;

        it('reverts', async function () {
        await assertRevert(land.create(0, parcelId, to));
        });
      });
    });

    describe('when the given land ID was already tracked by this contract', function () {
      const parcelId = _firstParcelId;

      it('reverts', async function () {
        await assertRevert(land.create(0, parcelId, user));
      });
    });
  });

  describe('send', function () {
    describe('when the address to send the land to is not the zero address', function () {
      const to = user;

      describe('when the given land ID was tracked by this land', function () {
        const parcelId = _firstParcelId;

        describe('when the msg.sender is the owner of the given land ID', function () {
          const sender = creator;

          it('send the ownership of the given land ID to the given address', async function () {
            await land.transfer(to, parcelId, { from: sender });

            const newOwner = await registry.ownerOf(parcelId);
            newOwner.should.be.equal(to);
          });

          it('emits a transfer event', async function () {
            const { logs } = await land.transfer(to, parcelId, { from: sender });

            logs.length.should.be.equal(1);
            checkTransferLog(logs[1], parcelId, sender, to);
          });

          it('adjusts owners balances', async function () {
            const previousBalance = await registry.assetsCount(sender);
            await land.transfer(to, parcelId, { from: sender });

            const newOwnerBalance = await registry.assetsCount(to);
            newOwnerBalance.should.be.bignumber.equal(1);

            const previousOwnerBalance = await registry.assetsCount(creator);
            previousOwnerBalance.should.be.bignumber.equal(previousBalance - 1);
          });

          it('places the last land of the sender in the position of the transferred land', async function () {
            const firstlandIndex = 0;
            const lastlandIndex = await registry.assetsCount(creator) - 1;
            const lastland = await registry.assetByIndex(creator, lastlandIndex);

            await land.transfer(to, parcelId, { from: sender });

            const swappedland = await registry.assetByIndex(creator, firstlandIndex);
            swappedland.should.be.bignumber.equal(lastland);
            await assertRevert(registry.assetByIndex(creator, lastlandIndex));
          });

          it('adds the land to the lands list of the new owner', async function () {
            await land.transfer(to, parcelId, { from: sender });

            const landIDs = await registry.landsOf(to);
            landIDs.length.should.be.equal(1);
            landIDs[0].should.be.bignumber.equal(parcelId);
          });
        });

        describe('when the msg.sender is not the owner of the given land ID', function () {
          const sender = anotherUser;

          it('reverts', async function () {
            await assertRevert(land.transfer(to, parcelId, { from: sender }));
          });
        });
      });

      describe('when the given land ID was not tracked by this land', function () {
        let parcelId = _unknownParcelId;

        it('reverts', async function () {
          await assertRevert(land.transfer(to, parcelId, { from: creator }));
        });
      });
    });

    describe('when the address to send the land to is the zero address', function () {
      const to = 0x0;

      it('reverts', async function () {
        await assertRevert(land.transfer(to, 0, { from: creator }));
      });
    });
  });

});
