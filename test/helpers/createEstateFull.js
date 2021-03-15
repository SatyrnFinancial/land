export default async function createSectorFull(
  contracts,
  xs,
  ys,
  owner,
  metadata,
  sendParams
) {
  const { space, sector } = contracts

  if (metadata) {
    await space.createSectorWithMetadata(xs, ys, owner, metadata, sendParams)
  } else {
    await space.createSector(xs, ys, owner, sendParams)
  }

  const tokenCount = await sector.balanceOf.call(owner)
  const token = await sector.tokenOfOwnerByIndex(
    owner,
    tokenCount.toNumber() - 1
  )

  return token.toString()
}
