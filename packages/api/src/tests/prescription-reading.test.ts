import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ItemPrescriptionSchema,
  addOptions,
  cylinderOptions,
  pdOptions,
  prescriptionIssues,
  sphereOptions,
} from '@optiworld/shared';

const valid = {
  right: { sphere: '-1.25', cylinder: '-0.50', axis: '90' },
  left: { sphere: '-1.00', cylinder: '', axis: '' },
  add: '1.50',
  pd: '62',
  notes: '',
};

describe('prescription standards', () => {
  it('accepts quarter-diopter powers, axis 1–180, add, and PD', () => {
    assert.equal(Object.keys(prescriptionIssues(valid)).length, 0);
    assert.equal(ItemPrescriptionSchema.safeParse(valid).success, true);
    assert.equal(prescriptionIssues({ ...valid, pd: '32/31' }).pd, undefined);
    assert.equal(sphereOptions()[0], '-20.00');
    assert.equal(sphereOptions().at(-1), '+20.00');
    assert.equal(cylinderOptions()[0], '-6.00');
    assert.equal(cylinderOptions().at(-1), '+6.00');
    assert.equal(addOptions()[0], '+0.25');
    assert.equal(addOptions().at(-1), '+4.00');
    assert.equal(pdOptions()[0], '46');
    assert.equal(pdOptions().at(-1), '80');
  });

  it('rejects letters, off-step powers, and an axis without a cylinder', () => {
    const issues = prescriptionIssues({
      right: { sphere: '1.5', cylinder: '2.2', axis: '1' },
      left: { sphere: 'q', cylinder: 'aa', axis: 'dd' },
      add: '9',
      pd: '12',
      notes: '',
    });
    assert.match(issues['right.cylinder'] ?? '', /0\.25/);
    assert.match(issues['left.sphere'] ?? '', /sphere/);
    assert.match(issues['left.cylinder'] ?? '', /cylinder/);
    assert.equal(issues.add !== undefined, true);
    assert.equal(issues.pd !== undefined, true);
    assert.equal(
      ItemPrescriptionSchema.safeParse({
        ...valid,
        right: { sphere: '-1.25', cylinder: '', axis: '90' },
      }).success,
      false,
    );
  });
});
