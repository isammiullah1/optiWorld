export type EyeReading = {
  sphere: string;
  cylinder: string;
  axis: string;
};

export type PrescriptionReading = {
  right: EyeReading;
  left: EyeReading;
  add: string;
  pd: string;
  notes: string;
};

export type PrescriptionIssueKey =
  | 'right.sphere'
  | 'right.cylinder'
  | 'right.axis'
  | 'left.sphere'
  | 'left.cylinder'
  | 'left.axis'
  | 'add'
  | 'pd'
  | 'form';

const POWER = /^[+-]?\d{0,2}(\.\d{0,2})?$/;
const ADD = /^\+?\d{0,1}(\.\d{0,2})?$/;
const AXIS = /^\d{0,3}$/;
const PD = /^\d{0,2}(\.\d?)?(\/\d{0,2}(\.\d?)?)?$/;

export function acceptPrescriptionInput(
  field: 'sphere' | 'cylinder' | 'axis' | 'add' | 'pd',
  value: string,
): boolean {
  if (field === 'axis') {
    return AXIS.test(value);
  }
  if (field === 'add') {
    return ADD.test(value);
  }
  if (field === 'pd') {
    return PD.test(value);
  }
  return POWER.test(value);
}

export function prescriptionIssues(
  value: PrescriptionReading,
): Partial<Record<PrescriptionIssueKey, string>> {
  const issues: Partial<Record<PrescriptionIssueKey, string>> = {};
  const right = eyeIssues('Right', value.right);
  const left = eyeIssues('Left', value.left);
  assignEye(issues, 'right', right);
  assignEye(issues, 'left', left);
  const addIssue = addIssueFor(value.add);
  if (addIssue) {
    issues.add = addIssue;
  }
  const pdIssue = pdIssueFor(value.pd);
  if (pdIssue) {
    issues.pd = pdIssue;
  }
  if (!hasPower(value.right) && !hasPower(value.left)) {
    issues.form = 'Enter a sphere or cylinder for at least one eye.';
  }
  return issues;
}

export function prescriptionIssuePaths(
  value: PrescriptionReading,
): Array<{ path: [string] | [string, string]; message: string }> {
  const paths: Array<{ path: [string] | [string, string]; message: string }> = [];
  for (const [key, message] of Object.entries(prescriptionIssues(value))) {
    if (!message) {
      continue;
    }
    const [head, tail] = key.split('.');
    if (!head) {
      continue;
    }
    paths.push({ path: tail ? [head, tail] : [head], message });
  }
  return paths;
}

function assignEye(
  issues: Partial<Record<PrescriptionIssueKey, string>>,
  side: 'right' | 'left',
  eye: { sphere?: string; cylinder?: string; axis?: string },
): void {
  if (eye.sphere) {
    issues[`${side}.sphere`] = eye.sphere;
  }
  if (eye.cylinder) {
    issues[`${side}.cylinder`] = eye.cylinder;
  }
  if (eye.axis) {
    issues[`${side}.axis`] = eye.axis;
  }
}

function eyeIssues(
  label: string,
  eye: EyeReading,
): { sphere?: string; cylinder?: string; axis?: string } {
  const issues: { sphere?: string; cylinder?: string; axis?: string } = {};
  const sphere = powerIssue(
    eye.sphere,
    -20,
    20,
    `${label} sphere must be from −20.00 to +20.00 in steps of 0.25.`,
  );
  if (sphere) {
    issues.sphere = sphere;
  }
  const cylinder = cylinderValue(eye.cylinder);
  if (cylinder === 'invalid') {
    issues.cylinder = `${label} cylinder must be from −6.00 to +6.00 in steps of 0.25, or blank.`;
  }
  const axis = eye.axis.trim();
  const hasCylinder = typeof cylinder === 'number';
  if (hasCylinder && !axis) {
    issues.axis = `${label} axis must be from 1 to 180 when a cylinder is entered.`;
  } else if (!hasCylinder && axis) {
    issues.axis = `${label} axis is only used when a cylinder is entered.`;
  } else if (axis && !axisInRange(axis)) {
    issues.axis = `${label} axis must be a whole number from 1 to 180.`;
  }
  return issues;
}

function powerIssue(raw: string, min: number, max: number, message: string): string | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  const power = signedPower(value);
  if (power === null || power < min || power > max || !isQuarter(power)) {
    return message;
  }
  return undefined;
}

function cylinderValue(raw: string): 'blank' | 'invalid' | number {
  const value = raw.trim();
  if (!value) {
    return 'blank';
  }
  const power = signedPower(value);
  if (power === null || power < -6 || power > 6 || !isQuarter(power)) {
    return 'invalid';
  }
  if (Math.abs(power) < 0.001) {
    return 'blank';
  }
  return power;
}

function addIssueFor(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  if (!/^\+?\d(\.\d{1,2})?$/.test(value)) {
    return 'Add must be from +0.25 to +4.00 in steps of 0.25.';
  }
  const add = Number(value.replace(/^\+/, ''));
  if (add < 0.25 || add > 4 || !isQuarter(add)) {
    return 'Add must be from +0.25 to +4.00 in steps of 0.25.';
  }
  return undefined;
}

function pdIssueFor(raw: string): string | undefined {
  const value = raw.trim().replace(/\s/g, '');
  if (!value) {
    return undefined;
  }
  const dual = /^(\d{2}(?:\.\d)?)\/(\d{2}(?:\.\d)?)$/.exec(value);
  if (dual?.[1] && dual[2]) {
    const right = Number(dual[1]);
    const left = Number(dual[2]);
    if (!monocularPd(right) || !monocularPd(left)) {
      return 'Each monocular PD must be 20–40 mm in steps of 0.5, written as 32/31.';
    }
    return undefined;
  }
  if (!/^\d{2}(?:\.\d)?$/.test(value) || !binocularPd(Number(value))) {
    return 'PD must be 46–80 mm, or two monocular values such as 32/31.';
  }
  return undefined;
}

function hasPower(eye: EyeReading): boolean {
  return eye.sphere.trim().length > 0 || typeof cylinderValue(eye.cylinder) === 'number';
}

function signedPower(value: string): number | null {
  if (!/^[+-]?\d{1,2}(\.\d{1,2})?$/.test(value)) {
    return null;
  }
  const power = Number(value);
  return Number.isFinite(power) ? power : null;
}

function axisInRange(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) {
    return false;
  }
  const axis = Number(value);
  return axis >= 1 && axis <= 180;
}

export function sphereOptions(): string[] {
  return quarterOptions(-20, 20);
}

export function cylinderOptions(): string[] {
  return quarterOptions(-6, 6);
}

export function addOptions(): string[] {
  return quarterOptions(0.25, 4);
}

export function axisOptions(): string[] {
  return Array.from({ length: 180 }, (_, index) => String(index + 1));
}

export function pdOptions(): string[] {
  const options: string[] = [];
  for (let step = 92; step <= 160; step += 1) {
    const value = step / 2;
    options.push(Number.isInteger(value) ? String(value) : value.toFixed(1));
  }
  return options;
}

function quarterOptions(min: number, max: number): string[] {
  const options: string[] = [];
  for (let step = Math.round(min * 4); step <= Math.round(max * 4); step += 1) {
    options.push(formatQuarter(step / 4));
  }
  return options;
}

function formatQuarter(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Math.abs(rounded).toFixed(2);
  if (Math.abs(rounded) < 0.001) {
    return '0.00';
  }
  return rounded > 0 ? `+${text}` : `-${text}`;
}

function isQuarter(value: number): boolean {
  const steps = value / 0.25;
  return Math.abs(steps - Math.round(steps)) < 0.001;
}

function isHalf(value: number): boolean {
  const steps = value / 0.5;
  return Math.abs(steps - Math.round(steps)) < 0.001;
}

function monocularPd(value: number): boolean {
  return value >= 20 && value <= 40 && isHalf(value);
}

function binocularPd(value: number): boolean {
  return value >= 46 && value <= 80 && isHalf(value);
}
