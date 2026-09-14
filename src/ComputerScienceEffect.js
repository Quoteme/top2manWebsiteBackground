import * as THREE from "./three.module.js";

// 5x7 bitmap font for the digits 0-9, rows listed top to bottom
const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPHS = [
  ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
];
// glyph plus one cell of padding on every side
const CELL_W = GLYPH_W + 2;
const CELL_H = GLYPH_H + 2;

const QUAD_VERTEX = `
varying vec2 vUv;
void main(){
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

// adds 1/255 to the red channel wherever the silhouette is set
const ACCUMULATE_FRAGMENT = `
uniform sampler2D silhouette;
varying vec2 vUv;
void main(){
	float covered = step( 0.5, texture2D( silhouette, vUv ).r );
	gl_FragColor = vec4( covered / 255.0, 0.0, 0.0, 0.0 );
}`;

// draws the digit for each cell's object count, colored like the object
// under it; around the pointer the plain scene shows through instead
const DIGIT_FRAGMENT = `
uniform sampler2D counts;
uniform sampler2D scene;
uniform sampler2D font;
uniform vec2 cells;
uniform vec2 resolution;
uniform float cellSize;
uniform vec3 color;
uniform float emptyOpacity;
uniform vec2 pointer;
uniform float radius;
uniform bool invert;

// premultiplied digit color for this pixel
vec4 digitColor( vec4 under ){
	vec2 cell = floor( gl_FragCoord.xy / cellSize );
	vec2 inCell = gl_FragCoord.xy / cellSize - cell;
	float count = floor( texture2D( counts, ( cell + 0.5 ) / cells ).r * 255.0 + 0.5 );
	float digit = min( count, 9.0 );
	vec2 g = floor( inCell * vec2( ${CELL_W}.0, ${CELL_H}.0 ) ) - 1.0;
	if( g.x < 0.0 || g.x >= ${GLYPH_W}.0 || g.y < 0.0 || g.y >= ${GLYPH_H}.0 ) return vec4( 0.0 );
	vec2 fontUv = ( vec2( digit * ${GLYPH_W}.0, 0.0 ) + g + 0.5 ) / vec2( ${GLYPH_W * 10}.0, ${GLYPH_H}.0 );
	if( texture2D( font, fontUv ).r < 0.5 ) return vec4( 0.0 );
	if( count == 0.0 ) return vec4( color * emptyOpacity, emptyOpacity );
	return vec4( mix( color, under.rgb, under.a ), 1.0 );
}

void main(){
	vec4 under = texture2D( scene, gl_FragCoord.xy / resolution );
	// 0 = plain scene, 1 = digits
	float mask = smoothstep( radius, 2.0 * radius, distance( gl_FragCoord.xy, pointer ) );
	if( invert ) mask = 1.0 - mask;
	vec4 plain = vec4( under.rgb * under.a, under.a );
	gl_FragColor = mix( plain, digitColor( under ), mask );
}`;

function genFontTexture() {
  const width = GLYPH_W * GLYPHS.length;
  const data = new Uint8Array(width * GLYPH_H * 4);
  GLYPHS.forEach((rows, digit) =>
    rows.forEach((row, r) => {
      // texture row 0 is the bottom, so flip the top-first glyph rows
      const y = GLYPH_H - 1 - r;
      for (let x = 0; x < GLYPH_W; x++) {
        const i = 4 * (y * width + digit * GLYPH_W + x);
        data[i] = data[i + 1] = data[i + 2] = row[x] == "1" ? 255 : 0;
        data[i + 3] = 255;
      }
    }),
  );
  const texture = new THREE.DataTexture(data, width, GLYPH_H, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function genTarget(depthBuffer = false) {
  return new THREE.WebGLRenderTarget(1, 1, {
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    depthBuffer,
    stencilBuffer: false,
  });
}

/**
 * Post-processing effect that replaces the rendered image with a grid of
 * digits, each one counting how many objects lie behind that cell.
 */
export class ComputerScienceEffect {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} cellSize - size of one digit cell in CSS pixels
   * @param {number} color - digit color where no object color is available
   * @param {number} emptyOpacity - opacity of the digits over empty cells
   * @param {number} radius - distance around the pointer without digits, in CSS pixels
   * @param {number} touchScale - factor applied to the radius for touch input, so the effect is not hidden under the finger
   * @param {bool} invert - show digits only around the pointer instead
   */
  constructor(
    renderer,
    {
      cellSize = 16,
      color = 0x222222,
      emptyOpacity = 0.1,
      radius = 50,
      touchScale = 3,
      invert = false,
    } = {},
  ) {
    this.renderer = renderer;
    this.cellSize = cellSize;
    this.radius = radius;
    this.touchScale = touchScale;
    this.pointerScale = 1;
    this.cells = new THREE.Vector2(1, 1);
    this.resolution = new THREE.Vector2(1, 1);
    // in device pixels, y up; far away when there is no pointer
    this.pointer = new THREE.Vector2(-1e6, -1e6);

    this.silhouetteTarget = genTarget();
    this.countTarget = genTarget();
    this.sceneTarget = genTarget(true);

    this.silhouetteMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.accumulateMaterial = new THREE.ShaderMaterial({
      uniforms: { silhouette: { value: this.silhouetteTarget.texture } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: ACCUMULATE_FRAGMENT,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    this.digitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        counts: { value: this.countTarget.texture },
        scene: { value: this.sceneTarget.texture },
        font: { value: genFontTexture() },
        cells: { value: this.cells },
        resolution: { value: this.resolution },
        cellSize: { value: cellSize },
        color: { value: new THREE.Color(color) },
        emptyOpacity: { value: emptyOpacity },
        pointer: { value: this.pointer },
        radius: { value: radius },
        invert: { value: invert },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: DIGIT_FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.accumulateMaterial,
    );
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 1;
    this.height = 1;
  }

  /**
   * @param {number} width - in CSS pixels
   * @param {number} height - in CSS pixels
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.cells.set(
      Math.ceil(width / this.cellSize),
      Math.ceil(height / this.cellSize),
    );
    this.silhouetteTarget.setSize(this.cells.x, this.cells.y);
    this.countTarget.setSize(this.cells.x, this.cells.y);
    const pixelRatio = this.renderer.getPixelRatio();
    this.resolution.set(width * pixelRatio, height * pixelRatio);
    this.sceneTarget.setSize(this.resolution.x, this.resolution.y);
    this.digitMaterial.uniforms.cellSize.value = this.cellSize * pixelRatio;
    this.updateRadius();
  }

  updateRadius() {
    this.digitMaterial.uniforms.radius.value =
      this.radius * this.pointerScale * this.renderer.getPixelRatio();
  }

  /**
   * @param {number} x - in CSS pixels from the left
   * @param {number} y - in CSS pixels from the top
   * @param {string} pointerType - PointerEvent.pointerType
   */
  setPointer(x, y, pointerType = "mouse") {
    const pixelRatio = this.renderer.getPixelRatio();
    this.pointer.set(x * pixelRatio, (this.height - y) * pixelRatio);
    this.pointerScale = pointerType == "touch" ? this.touchScale : 1;
    this.updateRadius();
  }

  clearPointer() {
    this.pointer.set(-1e6, -1e6);
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   */
  render(scene, camera) {
    const renderer = this.renderer;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const overrideMaterial = scene.overrideMaterial;

    // the count target has one texel per cell and the cell grid may
    // extend past the screen, so widen the camera's view to match
    const virtualWidth = this.cells.x * this.cellSize;
    const virtualHeight = this.cells.y * this.cellSize;
    camera.setViewOffset(
      this.width,
      this.height,
      0,
      this.height - virtualHeight,
      virtualWidth,
      virtualHeight,
    );

    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.setRenderTarget(this.countTarget);
    renderer.clear();

    // count every object once per cell by accumulating one silhouette at a time
    scene.overrideMaterial = this.silhouetteMaterial;
    const objects = scene.children.filter((o) => o.visible && !o.isLight);
    this.quad.material = this.accumulateMaterial;
    objects.forEach((object) => {
      objects.forEach((o) => (o.visible = o === object));
      renderer.setRenderTarget(this.silhouetteTarget);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(this.countTarget);
      renderer.render(this.quadScene, this.quadCamera);
    });
    objects.forEach((o) => (o.visible = true));

    camera.clearViewOffset();
    scene.overrideMaterial = overrideMaterial;

    // normal render, sampled by the digits for their color
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;

    this.quad.material = this.digitMaterial;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(this.quadScene, this.quadCamera);
  }
}
