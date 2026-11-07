/** Prisma-backed repositories. Returns the same shapes as memoryRepos. */
export function createPrismaRepos(prisma) {
  const userRepo = {
    findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
    findById: (id) => prisma.user.findUnique({ where: { id } }),
    create: (data) => prisma.user.create({ data }),
    setRole: (id, role) => prisma.user.update({ where: { id }, data: { role } }),
  };

  const QUERY_INCLUDE = { itemType: true, serviceType: true, specifications: true };
  const toQuery = (q) => q && ({
    id: q.id, userId: q.userId, queryType: q.queryType, itemName: q.itemName,
    itemType: q.itemType?.name ?? null, make: q.make, model: q.model,
    specifications: (q.specifications || []).map((x) => ({ key: x.key, value: x.value })),
    serviceType: q.serviceType?.name ?? null, location: q.location, description: q.description,
    status: q.status, noDataFlag: q.noDataFlag, diagnosis: q.diagnosis ?? null, servedFromCache: q.servedFromCache, createdAt: q.createdAt,
    resultCount: q._count?.results,
    results: (q.results || []).map((r) => ({
      price: Number(r.price), currency: r.currency, sourceUrl: r.sourceUrl,
      sourceId: r.sourceId, sourceName: r.source?.name, itemDetails: r.itemDetails,
      vintage: r.vintage, vintageBasis: r.vintageBasis, matchScore: r.matchScore, isMock: r.isMock, isReplay: r.isReplay,
    })),
  });

  const queryRepo = {
    async create(d) {
      const [itemType, serviceType] = await Promise.all([
        d.itemTypeName ? prisma.itemType.findUnique({ where: { name: d.itemTypeName } }) : null,
        d.serviceTypeName ? prisma.serviceType.findUnique({ where: { name: d.serviceTypeName } }) : null,
      ]);
      const q = await prisma.query.create({
        data: {
          userId: d.userId, queryType: d.queryType, itemName: d.itemName, itemTypeId: itemType?.id,
          make: d.make, model: d.model, serviceTypeId: serviceType?.id, location: d.location, description: d.description, createdAt: d.createdAt,
          specifications: d.specifications?.length ? { create: d.specifications.map((x) => ({ key: x.key, value: x.value })) } : undefined,
        },
        include: QUERY_INCLUDE,
      });
      return toQuery(q);
    },
    async complete(id, { results, noDataFlag, fromCache = false, diagnosis = null }) {
      await prisma.$transaction([
        prisma.resultItem.createMany({
          data: results.map((r) => ({
            queryId: id, price: r.price, currency: r.currency, sourceUrl: r.sourceUrl,
            sourceId: r.sourceId ?? null, itemDetails: r.itemDetails,
            vintage: r.vintage ? new Date(r.vintage) : null, vintageBasis: r.vintageBasis, matchScore: r.matchScore ?? null, isMock: r.isMock, isReplay: !!r.isReplay,
          })),
        }),
        prisma.query.update({ where: { id }, data: { status: noDataFlag ? 'NO_DATA' : 'COMPLETED', noDataFlag, servedFromCache: fromCache, diagnosis: diagnosis ?? undefined } }),
      ]);
    },
    async fail(id) { await prisma.query.update({ where: { id }, data: { status: 'FAILED' } }); },
    async findById(id) {
      return toQuery(await prisma.query.findUnique({ where: { id }, include: { ...QUERY_INCLUDE, results: { include: { source: true } } } }));
    },
    async listByUser(userId, { page = 1, pageSize = 10, type, search } = {}) {
      const where = {
        userId, ...(type && { queryType: type }),
        ...(search && { OR: ['itemName', 'make', 'model', 'location', 'description'].map((f) => ({ [f]: { contains: search, mode: 'insensitive' } })) }),
      };
      const [total, rows] = await prisma.$transaction([
        prisma.query.count({ where }),
        prisma.query.findMany({
          where, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
          include: { itemType: true, serviceType: true, _count: { select: { results: true } } },
        }),
      ]);
      return { total, items: rows.map(toQuery) };
    },
    async countsByUser(userId) {
      const g = await prisma.query.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } });
      const n = (s) => g.find((x) => x.status === s)?._count._all ?? 0;
      return { total: g.reduce((a, x) => a + x._count._all, 0), completed: n('COMPLETED'), noData: n('NO_DATA') };
    },
  };

  const model = (kind) => (kind === 'item' ? prisma.itemType : prisma.serviceType);
  const categoryRepo = {
    list: (kind, { includeInactive = false } = {}) => model(kind).findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } }),
    findByName: (kind, name) => model(kind).findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }),
    create: (kind, data) => model(kind).create({ data }),
    update: (kind, id, data) => model(kind).update({ where: { id }, data }).catch((e) => (e.code === 'P2025' ? null : Promise.reject(e))),
    listItemTypes() { return this.list('item'); },
    listServiceTypes() { return this.list('service'); },
  };

  const sourceDataRepo = {
    listSources: () => prisma.source.findMany({ orderBy: { id: 'asc' } }),
    findSourceByDomain: (domain) => prisma.source.findUnique({ where: { domain } }),
    createSource: (data) => prisma.source.create({ data }),
    updateSource: (id, data) => prisma.source.update({ where: { id }, data }).catch((e) => (e.code === 'P2025' ? null : Promise.reject(e))),
  };

  const toRate = (r) => r && ({
    id: r.id, serviceType: r.serviceType.name, location: r.location, description: r.description, price: Number(r.price),
    currency: r.currency, sourceName: r.sourceName, sourceUrl: r.sourceUrl, vintage: r.vintage.toISOString(), isActive: r.isActive,
  });
  const rateData = async ({ serviceType, ...rest }) => ({
    ...rest, ...(serviceType && { serviceTypeId: (await prisma.serviceType.findUnique({ where: { name: serviceType } })).id }),
    ...(rest.vintage && { vintage: new Date(rest.vintage) }),
  });
  const rateRepo = {
    async list() { return (await prisma.curatedRate.findMany({ include: { serviceType: true }, orderBy: { id: 'desc' } })).map(toRate); },
    async create(d) { return toRate(await prisma.curatedRate.create({ data: await rateData(d), include: { serviceType: true } })); },
    async update(id, d) {
      try { return toRate(await prisma.curatedRate.update({ where: { id }, data: await rateData(d), include: { serviceType: true } })); }
      catch (e) { if (e.code === 'P2025') return null; throw e; }
    },
    async findMatching({ serviceType, city }) {
      if (!city) return [];
      const rows = await prisma.curatedRate.findMany({
        where: { isActive: true, serviceType: { name: serviceType }, OR: [{ location: { equals: city, mode: 'insensitive' } }, { location: { startsWith: `${city},`, mode: 'insensitive' } }] },
        include: { serviceType: true },
      });
      return rows.map(toRate);
    },
  };

  return { userRepo, queryRepo, categoryRepo, sourceDataRepo, rateRepo };
}
