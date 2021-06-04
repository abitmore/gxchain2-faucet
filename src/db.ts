import { Op } from 'sequelize';
import { RecordInfo, AccountInfo, sequelize } from './model';
import { BN } from 'ethereumjs-util';
import Web3 from 'web3';
import { faucetobject } from './types';

export class DB {
  private initPromise!: Promise<void>;
  constructor() {
    this.initPromise = this.init();
  }

  async init() {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    await sequelize.authenticate();
    await sequelize.sync();
  }

  async addRecordinfo(fromaddress: string, toaddress: string, ip: string, amount: string) {
    await this.initPromise;
    const transaction = await sequelize.transaction();
    try {
      const recordinfo = await RecordInfo.create(
        {
          from: fromaddress,
          to: toaddress,
          ip: ip,
          amount: amount
        },
        { transaction }
      );
      await transaction.commit();
      return recordinfo;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async checkAddressLimit(address: string): Promise<boolean> {
    await this.initPromise;
    const transaction = await sequelize.transaction();
    const transRecords = await RecordInfo.findAll({
      order: [['id', 'DESC']],
      limit: 3,
      where: {
        [Op.and]: {
          to: address,
          state: { [Op.or]: [0, 1, 2] }
        }
      },
      transaction
    });
    await transaction.commit();
    if (transRecords.length < 3) {
      return true;
    }
    if (Date.now() - transRecords[2].createdAt >= 1000 * 60 * 60 * 24) {
      return true;
    }
    return false;
  }

  async checkIpLimit(ip: string): Promise<boolean> {
    await this.initPromise;
    const transaction = await sequelize.transaction();
    const transRecords = await RecordInfo.findAll({
      order: [['id', 'DESC']],
      limit: 10,
      where: {
        ip: ip
      },
      transaction
    });
    await transaction.commit();
    if (transRecords.length < 10) {
      return true;
    }
    if (Date.now() - transRecords[9].createdAt >= 1000 * 60 * 60 * 24) {
      return true;
    }
    return false;
  }

  async updateNonce(addr: string, nonceupdate: number, type: number) {
    await this.initPromise;
    const transaction = await sequelize.transaction();
    try {
      const addrRecord = await AccountInfo.findOne({
        where: {
          address: addr
        },
        transaction
      });
      if (type === 0) {
        addrRecord!.nonceTodo = nonceupdate;
      } else {
        addrRecord!.nonceNow = nonceupdate;
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async findUnaffirmtranscation() {
    await this.initPromise;
    const transaction = await sequelize.transaction();
    try {
      const transRecords = await RecordInfo.findAll({
        order: [['id', 'DESC']],
        where: {
          [Op.and]: {
            state: 1
          }
        },
        transaction
      });
      await transaction.commit();
      return transRecords;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async initAccounts(address: string[], faucetarray: faucetobject[], web3: Web3) {
    await this.initPromise;
    const blocknumber = await web3.eth.getBlockNumber();
    const transaction = await sequelize.transaction();
    try {
      for (const addr of address) {
        const addrRecord = await AccountInfo.findOne({
          where: {
            address: addr
          },
          transaction
        });
        if (addrRecord === null) {
          const nonce = await web3.eth.getTransactionCount(addr, blocknumber);
          const balance = new BN(await web3.eth.getBalance(addr, blocknumber));
          await AccountInfo.create(
            {
              address: addr,
              nonceTodo: nonce,
              nonceNow: nonce
            },
            { transaction }
          );
          faucetarray.push(new faucetobject(addr, nonce, nonce, 0, balance));
        } else {
          const nonce = await web3.eth.getTransactionCount(addr, blocknumber);
          const balance = new BN(await web3.eth.getBalance(addr, blocknumber));
          addrRecord.nonceTodo = nonce > addrRecord.nonceTodo ? nonce : addrRecord.nonceTodo;
          addrRecord.nonceNow = nonce > addrRecord.nonceNow ? nonce : addrRecord.nonceNow;
          faucetarray.push(new faucetobject(addr, addrRecord.nonceTodo, addrRecord.nonceNow, addrRecord.nonceTodo - addrRecord.nonceNow, balance));
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async saveRecordInfos(recordinfo: RecordInfo, recordinfo1?: RecordInfo) {
    const transaction = await sequelize.transaction();
    try {
      await recordinfo.save({ transaction });
      if (recordinfo1) {
        await recordinfo1.save({ transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
