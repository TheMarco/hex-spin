export const S = 1.0;
export const H = (S * Math.sqrt(3)) / 2;
export const ROWS = 7;
export const COLS = 12;

// Hex-shaped play field. Side length in triangle-edges. Center is a real
// vertex (k+j odd). For side 3: 54 triangles, 19 interior + 18 boundary vertices.
export const HEX_SIDE = 3;
export const HEX_CENTER_K = 6;
export const HEX_CENTER_J = 3;

export const vPos = (k, j) => [(k * S) / 2, 0 - j * H, 0];

export const key = (c, r) => `${c},${r}`;

export const isRealVertex = (k, j) => (k + j) % 2 === 1;

export const isUpTriangle = (col, row) => (col + row) % 2 === 0;

// Six triangles around vertex V=(k,j), CW from N. Spec §3.4.
export const ring = (k, j) => [
  [k - 1, j - 1],
  [k, j - 1],
  [k, j],
  [k - 1, j],
  [k - 2, j],
  [k - 2, j - 1],
];

// Triangle's three corner vertices in (k, j) coords. Spec §3.3.
export const triangleVertices = (col, row) => {
  if (isUpTriangle(col, row)) {
    return [
      [col + 1, row], // apex
      [col, row + 1], // base-left
      [col + 2, row + 1], // base-right
    ];
  }
  return [
    [col, row], // top-left
    [col + 2, row], // top-right
    [col + 1, row + 1], // apex
  ];
};

// Local (x, y) centroid of triangle, in board-group coords.
export const triangleCentroid = (col, row) => {
  const corners = triangleVertices(col, row).map(([k, j]) => vPos(k, j));
  return [
    (corners[0][0] + corners[1][0] + corners[2][0]) / 3,
    (corners[0][1] + corners[1][1] + corners[2][1]) / 3,
  ];
};

// Point-in-hex test. Our triangulation produces a flat-top hex naturally
// (vertex rings have left/right points, flat top/bottom edges).
// Flat-top regular hex with circumradius R centered at origin:
//   |y| ≤ R√3/2    (top/bottom flat edges)
//   |x| + |y|/√3 ≤ R    (four slanted edges)
export function isInsideHex(col, row, epsilon = 0.02) {
  const [cx, cy] = triangleCentroid(col, row);
  const [hx, hy] = vPos(HEX_CENTER_K, HEX_CENTER_J);
  const dx = Math.abs(cx - hx);
  const dy = Math.abs(cy - hy);
  const R = HEX_SIDE;
  return dy <= (R * Math.sqrt(3)) / 2 + epsilon && dx + dy / Math.sqrt(3) <= R + epsilon;
}

export const easings = {
  linear: (t) => t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  sinePulse: (t) => Math.sin(t * Math.PI),
};
