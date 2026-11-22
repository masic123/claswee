// Small relational query fixture with atomic compare-and-set updates.
const clone = value => JSON.parse(JSON.stringify(value));
const KEYS = { claswee_rooms: 'room_code', claswee_room_sessions: 'token_hash', claswee_room_messages: 'id' };
function database(seed = {}) {
  const tables = clone(seed);
  function from(table) {
    tables[table] = tables[table] || [];
    let op = 'select', value, filters = [], selected = false, sort, take, interval, conflict, counted = false;
    const query = {
      select(_columns, options = {}) { selected = true; counted = options.count === 'exact'; return query; },
      insert(data) { op = 'insert'; value = data; return query; },
      upsert(data, options = {}) { op = 'upsert'; value = data; conflict = options.onConflict; return query; },
      update(data) { op = 'update'; value = data; return query; },
      delete() { op = 'delete'; return query; },
      eq(key, v) { filters.push(row => row[key] === v); return query; },
      gte(key, v) { filters.push(row => row[key] >= v); return query; },
      is(key, v) { filters.push(row => row[key] === v); return query; },
      in(key, v) { filters.push(row => v.includes(row[key])); return query; },
      lte(key, v) { filters.push(row => row[key] <= v); return query; },
      lt(key, v) { filters.push(row => row[key] < v); return query; },
      order(key, options = {}) { sort = [key, options.ascending !== false]; return query; },
      limit(n) { take = n; return query; },
      range(start, end) { interval = [start, end]; return query; },
      then(resolve, reject) {
        try {
          let matches = tables[table].filter(row => filters.every(f => f(row)));
          if (sort) matches.sort((a, b) => String(a[sort[0]]).localeCompare(String(b[sort[0]])) * (sort[1] ? 1 : -1));
          if (interval) matches = matches.slice(interval[0], interval[1] + 1);
          if (take != null) matches = matches.slice(0, take);
          if (op === 'insert' || op === 'upsert') {
            const key = conflict || KEYS[table], existing = key && tables[table].find(row => key.split(',').every(column => row[column] === value[column]));
            if (existing && op === 'insert') return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }).then(resolve, reject);
            if (existing) Object.assign(existing, clone(value)); else tables[table].push(clone(value));
            matches = [value];
          } else if (op === 'update') matches.forEach(row => Object.assign(row, clone(value)));
          else if (op === 'delete') tables[table] = tables[table].filter(row => !matches.includes(row));
          return Promise.resolve({ data: selected || op === 'select' ? clone(matches) : [], error: null, ...(counted ? { count: matches.length } : {}) }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      }
    }; return query;
  }
  return { from, tables };
}
module.exports = { database };
