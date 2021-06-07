import * as THREE from './three.module.js';
import {TrackballControls} from './TrackballControls.js';
import {ParametricGeometries} from './ParametricGeometries.js'

let camera, controls, scene, renderer;
let mesh;
let ambientLight, pointLight

init();
animate();

function init(){
	camera = new THREE.PerspectiveCamera( 70, 1, 1, 10000 );
	camera.position.z = 400;
	scene = new THREE.Scene();
	mesh = genMesh();
	scene.add( mesh );
	ambientLight = new THREE.AmbientLight( 0xffffff, 0.3 );
	scene.add( ambientLight );
	pointLight = new THREE.PointLight( 0xffffff )
	pointLight.position.set(200, 200, 200)
	scene.add(pointLight);
	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.physicallyCorrectLights = true;
	document.getElementById("preview").appendChild( renderer.domElement );
	controls = new TrackballControls( camera, renderer.domElement );
	controls.rotateSpeed = 1.0;
	controls.zoomSpeed = 1.2;
	controls.panSpeed = 0.8;
	rendererResize();
}

function animate(){
	requestAnimationFrame(animate);
	controls.update();
	renderer.render(scene, camera);
}

function rendererResize(
	width=parseInt(document.getElementById("width").value),
	height=parseInt(document.getElementById("height").value),
){
	renderer.setSize( width, height );
	camera.aspect = width/height;
	camera.updateProjectionMatrix();
}

/**
 * Generate a Mesh corresponding to a topological 2-manifolg
 * @param {bool} orientable
 * @param {number} genus - (Demi-)Genus
 */
function genMesh(
	orientable=getOrientable(),
	genus=getGenus(),
){
	const texture = new THREE.TextureLoader().load( 'res/texture.png' );
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	const material = new THREE.MeshLambertMaterial( { map: texture } );
	//
	// Sphere
	if( orientable && genus==0 )
		return new THREE.Mesh(
			new THREE.SphereGeometry(100, 40, 40),
			material
		);
	// n-Torus
	else if( orientable && genus>=1 ){
		let mesh = new THREE.Group();
		let torus = new THREE.Mesh(
			new THREE.TorusGeometry( 100, 30, 16, 100 ),
			material
		);
		for(let i=0; i<genus; i++){
			let clone = torus.clone();
			clone.position.x = i*200-(genus-1)*100;
			clone.scale.y = (-1)**i
			mesh.add(clone)
		}
		// mesh.scale.set(1/Math.sqrt(genus),1/Math.sqrt(genus),1/Math.sqrt(genus))
		return mesh;
	}
	// Projektiver Raum
	else if( !orientable && genus==1 ){
		return new THREE.Mesh(
			new THREE.ParametricBufferGeometry(
				(u,v,target) => target.set(
					150*Math.cos(-2*Math.PI*u)*Math.sin(-Math.PI*v)/2,
					150*Math.sin(-2*Math.PI*u)*Math.sin(-Math.PI*v)/2,
					150*(Math.cos(-Math.PI/2*v)**2-Math.cos(-2*Math.PI*u)**2*Math.sin(-Math.PI/2*v)**2))/2
			, 110, 110 ),
			material
		)
	}
	// Kleinsche Flasche
	else if( !orientable && genus==2 ){
		let mesh = new THREE.Mesh(
			new THREE.ParametricBufferGeometry( ParametricGeometries.klein, 50, 50 ),
			material
		)
		material.side = THREE.DoubleSide;
		mesh.scale.set(15,15,15);
		return mesh
	}
	else if( !orientable && genus >2 ){
		let mesh = new THREE.Group();
		let a
		// Dycks Theorem
		if( genus%2 ){
			mesh.add(genMesh(true,Math.floor(genus/2)));
			a = genMesh(false,1);
		}
		else{
			mesh.add(genMesh(true,Math.floor(genus/2)-1));
			a = genMesh(false,2);
			a.rotateZ(Math.PI/2)
		}
		a.position.set(0,200,0);
		mesh.add(a)
		return mesh
	}
}

/**
 * Remove old mesh and replace it by new one
 */
function updateMesh(orientable, genus){
	scene.remove(mesh);
	mesh = genMesh(orientable, genus);
	scene.add(mesh);
}

/**
 * Remove old name, formula, euler-characteristic
 * and replace it by correct info
 */
function updateInfo(){
	document.getElementById("name").innerText = name();
	document.getElementById("formula").innerText = formula();
	document.getElementById("eulerchar").innerText = eulerChar();
	MathJax.typeset()
}

/**
 * Returns the name for a given topological 2-manifold
 */
function name(
	orientable=getOrientable(),
	genus=getGenus(),
){
	return `${orientable?"":"Nicht-"}orientierbare 2-Mannigfaltigkeit von ${orientable?"Geschlecht":"Kreuzkappenzahl"} ${genus}`
}

/**
 * Returns the formula for a given topological 2-manifold
*/
function formula(
	orientable=getOrientable(),
	genus=getGenus(),
){
	return `\\(\\#_{j=1}^${genus} ${orientable?"T^2":"P^2"}\\)`
}

/**
 * Returns the euler characteristic for a given topological 2-manifold
*/
function eulerChar(
	orientable=getOrientable(),
	genus=getGenus(),
){
	return orientable? 2-2*genus : 2-genus
}

/**
 * Return true/false if the user checked orientable
 * @returns {bool} State of the checkbox if the object is orientable
 */
function getOrientable(){
	return document.getElementById("orientable").checked
}

/**
 * Return the user which the user entered in the settings
 * @returns {number} (Demi-)Genus which the user supplied
 */
function getGenus(){
	return parseInt(document.getElementById("demigenus").value);
}

document.getElementById("demigenus").onchange =
document.getElementById("orientable").onchange = _ => {updateMesh(); updateInfo()};

document.getElementById("width").onchange =
document.getElementById("height").onchange = _ => rendererResize();
