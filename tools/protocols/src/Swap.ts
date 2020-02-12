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

import { ethers } from 'ethers'
import { chainIds, chainNames, MIN_CONFIRMATIONS } from '@airswap/constants'
import { SignedOrder } from '@airswap/types'

import * as SwapContract from '@airswap/swap/build/contracts/Swap.json'
import * as swapDeploys from '@airswap/swap/deploys.json'
const SwapInterface = new ethers.utils.Interface(
  JSON.stringify(SwapContract.abi)
)

export class Swap {
  chainId: string
  contract: ethers.Contract

  constructor(
    chainId = chainIds.RINKEBY,
    signerOrProvider?: ethers.Signer | ethers.providers.Provider
  ) {
    this.chainId = chainId
    this.contract = new ethers.Contract(
      Swap.getAddress(chainId),
      SwapInterface,
      signerOrProvider ||
        ethers.getDefaultProvider(chainNames[chainId].toLowerCase())
    )
  }

  static getAddress(chainId = chainIds.RINKEBY): string {
    if (chainId in swapDeploys) {
      return swapDeploys[chainId]
    }
    throw new Error(`Swap deploy not found for chainId ${chainId}`)
  }

  async swap(order: SignedOrder, signer?: ethers.Signer): Promise<string> {
    let contract = this.contract
    if (!this.contract.signer) {
      if (signer === undefined) {
        throw new Error('Signer must be provided')
      } else {
        contract = new ethers.Contract(
          Swap.getAddress(this.chainId),
          SwapInterface,
          signer
        )
      }
    }
    const tx = await contract.swap(order)
    await tx.wait(MIN_CONFIRMATIONS)
    return tx.hash
  }
}
