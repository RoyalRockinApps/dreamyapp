/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAffiliated } from '../production';
import { buildSeed, MEMBER_ID, OWNER_ID, RENTER_ID } from '../seed';

test('the app is for the theatre’s staff, cast, crew and companies; other renters only audition', () => {
  const { users, productions } = buildSeed();
  const who = (id: string) => users.find((u) => u.id === id)!;
  assert.equal(isAffiliated(who(OWNER_ID), productions), true, 'owner');
  assert.equal(isAffiliated(who(MEMBER_ID), productions), true, 'cast member');
  assert.equal(isAffiliated(who(RENTER_ID), productions), false, 'a renter outside every company');
  assert.equal(isAffiliated(who(MEMBER_ID), []), true, 'cast and crew even between shows');
  const inCompany = productions.map((p, i) => (i ? p : { ...p, members: [...p.members, { userId: RENTER_ID, groupIds: [] }] }));
  assert.equal(isAffiliated(who(RENTER_ID), inCompany), true, 'a renter in a company');
});
