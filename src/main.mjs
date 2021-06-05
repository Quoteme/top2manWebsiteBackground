import * as THREE from './three.module.js';
import {TrackballControls} from './TrackballControls.js';

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
	const texture = new THREE.TextureLoader().load( '../res/texture.png' );
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	const material = new THREE.MeshLambertMaterial( { map: texture } );
	//
	if( orientable && genus==0 )
		return new THREE.Mesh(
			new THREE.SphereGeometry(100, 40, 40),
			material
		);
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
		mesh.scale.set(1/Math.sqrt(genus),1/Math.sqrt(genus),1/Math.sqrt(genus))
		return mesh;
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
document.getElementById("orientable").onchange = _ => updateMesh();

document.getElementById("width").onchange =
document.getElementById("height").onchange = _ => rendererResize();
