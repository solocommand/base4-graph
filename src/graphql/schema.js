const { join } = require('path');
const { makeExecutableSchema } = require('graphql-tools');
const { importSchema } = require('graphql-import');
const resolvers = require('./resolvers');
const {
  ArrayValueDirective,
  ContentQueryAllDirective,
  ContentQueryOneDirective,
  MomentFormatDirective,
  MutatedValueDirective,
  PaginatedDirective,
  PassThruDirective,
  RefManyDirective,
  RefOneDirective,
  ValueDirective,
} = require('./directives');

const typeDefs = importSchema(join(__dirname, 'definitions/index.graphql'));

module.exports = makeExecutableSchema({
  typeDefs,
  resolvers,
  schemaDirectives: {
    arrayValue: ArrayValueDirective,
    contentQueryAll: ContentQueryAllDirective,
    contentQueryOne: ContentQueryOneDirective,
    momentFormat: MomentFormatDirective,
    mutatedValue: MutatedValueDirective,
    paginated: PaginatedDirective,
    passThru: PassThruDirective,
    refMany: RefManyDirective,
    refOne: RefOneDirective,
    value: ValueDirective,
  },
});