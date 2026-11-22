<?php
/**
 * Plugin Name: CK Oído – CORS para el frontend Astro
 * Description: Permite que https://taxlockedwallet.com (sitio en Astro) use la Store API de WooCommerce de esta tienda: carrito y checkout sin salir del sitio. Para quitarlo, borre este archivo.
 */
defined( 'ABSPATH' ) || exit;

add_filter(
	'allowed_http_origins',
	function ( $origins ) {
		$origins[] = 'https://taxlockedwallet.com';
		return $origins;
	}
);
