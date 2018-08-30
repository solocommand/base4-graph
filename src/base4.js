const { ApolloError, UserInputError } = require('apollo-server-express');
const { ObjectID } = require('mongodb');
const Tenant = require('./classes/tenant');
const isObject = require('./utils/is-object');

const { isArray } = Array;

/**
 * The Base4 collection namespaces.
 *
 * These are used to calculcate the MongoDB
 * database names.
 *
 * @type {array}
 */
const namespaces = [
  'email',
  'magazine',
  'platform',
  'website',
];

/**
 * The Base4 instance, instantiated per tenant.
 *
 * @class
 */
class Base4 {
  /**
   *
   * @param {object} params The constuctor parameters.
   * @param {object} params.db The Base4 database connection/client.
   * @param {string} params.tenantKey The Base4 tenant key, e.g. account_group.
   */
  constructor({ db, tenantKey }) {
    this.db = db;
    this.tenant = new Tenant(tenantKey);
    this.tenant.check();
  }

  async findById(namespace, resource, id, criteria) {
    if (!id) return null;
    const collection = await this.collection(namespace, resource);
    return collection.findOne({ ...criteria, _id: Base4.coerceID(id) });
  }

  async strictFindById(namespace, resource, id, criteria) {
    const doc = await this.findById(namespace, resource, id, criteria);
    if (!doc) throw new ApolloError(`No ${namespace} ${resource} record found for ID ${id}`, 'RECORD_NOT_FOUND');
    return doc;
  }

  /**
   *
   * @param {string} namespace The collection namespace, e.g. `platform`.
   * @param {string} resource The resource name, e.g. `Content`.
   * @returns {Promise}
   */
  collection(namespace, resource) {
    if (!namespaces.includes(namespace)) {
      throw new UserInputError(`The provided Base4 collection namespace '${namespace}' is invalid.`);
    }
    return this.db.collection(`${this.tenant.key}_${namespace}`, resource);
  }

  /**
   * Returns a reference-one document for the provided namespace, resource, and ref/id.
   *
   * For example, to retrieve the `createdBy` document referenced on a `Content` document,
   * run the following:
   *
   * `referenceOne('platform', 'User', content.createdBy);`
   *
   * @deprecated
   * @param {string} namespace The reference's namespace, e.g. `platform`.
   * @param {string} resource The reference's resource name, e.g. `Content`.
   * @param {*} ref The reference. Either an ID or a complex DBRef.
   * @param {?object} criteria Additional query criteria to add.
   * @returns {Promise<null|object>}
   */
  async reference(namespace, resource, ref, criteria) {
    const id = Base4.extractRefId(ref);
    if (!id) return null;
    const collection = await this.collection(namespace, resource);
    return collection.findOne({ ...criteria, _id: id });
  }

  /**
   * Returns a reference-one document for the provided model name and ref/id.
   *
   * For example, to retrieve the `createdBy` document referenced on a `Content` document,
   * run the following:
   *
   * `referenceOne({ model: 'platform.User', ref: content.createdBy });`
   *
   * @param {object} params The function parameters.
   * @param {string} params.model The reference's model name, e.g. `platform.Content`.
   * @param {*} params.ref The reference. Either an ID or a complex DBRef.
   * @param {?object} params.criteria Additional query criteria to add.
   * @returns {Promise<null|object>}
   */
  async referenceOne({ model, ref, criteria }) {
    const id = Base4.extractRefId(ref);
    if (!id) return null;
    const { namespace, resource } = Base4.parseModelName(model);
    const collection = await this.collection(namespace, resource);
    return collection.findOne({ ...criteria, _id: id });
  }

  /**
   * Returns an array of reference-many documents for the provided namespace, resource, and ref/id.
   *
   * For example, to retrieve the `taxonomies` documents referenced on a `Content` document,
   * run the following:
   *
   * `referenceMany('platform', 'Taxonomy', content.taxonomies);`
   *
   * @deprecated
   * @param {string} namespace The reference's namespace, e.g. `platform`.
   * @param {string} resource The reference's resource name, e.g. `Content`.
   * @param {*} ref The reference. Either an ID or a complex DBRef.
   * @param {?object} criteria Additional query criteria to add.
   * @returns {Promise<null|object>}
   */
  async references(namespace, resource, refs, criteria) {
    const ids = Base4.extractRefIds(refs);
    if (!ids.length) return [];
    const collection = await this.collection(namespace, resource);
    const cursor = await collection.find({ ...criteria, _id: { $in: ids } });
    return cursor.toArray();
  }

  /**
   * Returns an array of reference-many documents for the provided model name and ref/id.
   *
   * For example, to retrieve the `taxonomy` documents referenced on a `Content` document,
   * run the following:
   *
   * `referenceMany({ model: 'platform.Taxonomy', refs: content.taxonomy });`
   *
   * @param {object} params The function parameters.
   * @param {string} params.model The reference's model name, e.g. `platform.Content`.
   * @param {array} params.ref The reference. Either an array of IDs or a complex DBRefs.
   * @param {?object} params.criteria Additional query criteria to add.
   * @param {?object} params.sort Sort criteria to add, in MongoDB sort format.
   * @returns {Promise<object[]>}
   */
  async referenceMany({
    model,
    refs,
    criteria,
    sort = {},
    first,
  }) {
    const ids = Base4.extractRefIds(refs);
    if (!ids.length) return [];
    const { namespace, resource } = Base4.parseModelName(model);
    const collection = await this.collection(namespace, resource);
    const cursor = await collection.find({ ...criteria, _id: { $in: ids } }).sort(sort).limit(first || 0);
    return cursor.toArray();
  }

  /**
   * @deprecated
   */
  async inverse(namespace, resource, field, id, criteria, sort = {}) {
    if (!id) return [];
    const collection = await this.collection(namespace, resource);
    const cursor = await collection.find({ ...criteria, [field]: id }).sort(sort);
    return cursor.toArray();
  }

  async inverseMany({
    model,
    field,
    id,
    criteria,
    sort = {},
    first,
  }) {
    if (!id) return [];
    const { namespace, resource } = Base4.parseModelName(model);
    const collection = await this.collection(namespace, resource);
    const cursor = await collection.find({ ...criteria, [field]: id }).sort(sort).limit(first || 0);
    return cursor.toArray();
  }

  /**
   * Parses a model name into its namespace and resource parts.
   *
   * For example, `platform.Content` becomes `{ namespace: 'platform', resource: 'Content' }`
   *
   * @param {string} name
   * @returns {object}
   */
  static parseModelName(name) {
    const [namespace, resource] = name.split('.');
    return { namespace, resource };
  }

  /**
   * Gets a Mongo ID from either a complex (DBRef) or simple (ObjectID) reference.
   *
   * @param {?array} refs
   */
  static extractRefId(ref) {
    const id = isObject(ref) && ref.oid ? ref.oid : ref;
    return id || null;
  }

  /**
   * Gets an array of Mongo IDs from an array
   * of either complex (DBRef) or simple (ObjectID) references.
   *
   * @param {?array} refs
   */
  static extractRefIds(refs) {
    if (!isArray(refs) || !refs.length) return [];
    return refs.map(ref => Base4.extractRefId(ref)).filter(id => id);
  }

  /**
   * Coerces a string ID to either a MongoDB ObjectID or an integer.
   *
   * If the `id` value is not a string, or does not match the requirements for
   * the above, the `id` value will be returned as-is.
   *
   * @param {*} id
   */
  static coerceID(id) {
    if (typeof id !== 'string') return id;
    if (/^[a-f0-9]{24}$/.test(id)) return new ObjectID(id);
    if (/^\d+$/.test(id)) return Number(id);
    return id;
  }

  /**
   * Extracts a mutation value from a document for the provided type and field.
   *
   * @param {object} doc The MongoDB document to extract from.
   * @param {string} type The mutation type, e.g. `Website`.
   * @param {string} field The field key of the mutation.
   */
  static extractMutationValue(doc, type, field) {
    const { mutations } = doc;
    if (!isObject(mutations)) return null;
    const keyValues = mutations[type];
    if (!isObject(keyValues)) return null;
    return keyValues[field];
  }

  /**
   * Fills a mutation value from a document for the provided type and field.
   * If a mutation value is found, it will use it, otherwise it will
   * fallback to the "standard" field on the document.
   *
   * @param {object} doc
   * @param {string} type
   * @param {string} field
   */
  static fillMutation(doc, type, field) {
    const value = Base4.extractMutationValue(doc, type, field);
    return value || doc[field];
  }
}

module.exports = Base4;
