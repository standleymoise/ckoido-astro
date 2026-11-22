<?php
/**
 * Plugin Name: CK Oído – Cuentas para el frontend Astro
 * Description: Inicio de sesión, registro y «Mi cuenta» por API para el sitio en Astro (https://taxlockedwallet.com). Usa un token propio en el encabezado X-CKOido-Token (las cookies de WordPress no sirven entre dominios). Con el token, la Store API también reconoce al cliente y sus pedidos quedan en su cuenta. Para quitarlo, borre este archivo.
 *
 * Rutas (todas en /wp-json/ckoido/v1/):
 *   POST registro   { email, password, nombre, apellidos }  → { token, perfil }
 *   POST login      { email, password }                     → { token, perfil }
 *   POST recuperar  { email }                               → envía el correo de WordPress para cambiar la contraseña
 *   GET  cuenta                                             → { perfil, pedidos }   (requiere token)
 *   POST cuenta     { nombre, apellidos, telefono, ... }    → { perfil }            (requiere token)
 *   POST salir                                              → cierra esta sesión     (requiere token)
 */

defined( 'ABSPATH' ) || exit;

const CKOIDO_ENCABEZADO = 'X-CKOido-Token';
const CKOIDO_DIAS       = 30;
const CKOIDO_INTENTOS   = 8; // por IP cada 15 minutos (login, registro y recuperar)

// ---------------------------------------------------------------- tokens

function ckoido_hash( $token ) {
	return hash_hmac( 'sha256', $token, wp_salt( 'auth' ) );
}

function ckoido_crear_token( $user_id ) {
	$token = bin2hex( random_bytes( 32 ) );
	$hash  = ckoido_hash( $token );
	add_user_meta( $user_id, 'ckoido_token', $hash );
	update_user_meta( $user_id, 'ckoido_token_exp_' . $hash, time() + CKOIDO_DIAS * DAY_IN_SECONDS );
	return $token;
}

function ckoido_token_de_la_peticion() {
	$token = isset( $_SERVER['HTTP_X_CKOIDO_TOKEN'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_CKOIDO_TOKEN'] ) ) : '';
	return preg_match( '/^[a-f0-9]{64}$/', $token ) ? $token : '';
}

function ckoido_usuario_por_token( $token ) {
	$hash = ckoido_hash( $token );
	$ids  = get_users(
		array(
			'meta_key'   => 'ckoido_token',
			'meta_value' => $hash,
			'number'     => 1,
			'fields'     => 'ID',
		)
	);
	if ( ! $ids ) {
		return 0;
	}
	$id  = (int) $ids[0];
	$exp = (int) get_user_meta( $id, 'ckoido_token_exp_' . $hash, true );
	if ( $exp < time() ) {
		ckoido_borrar_token( $id, $hash );
		return 0;
	}
	return $id;
}

function ckoido_borrar_token( $user_id, $hash ) {
	delete_user_meta( $user_id, 'ckoido_token', $hash );
	delete_user_meta( $user_id, 'ckoido_token_exp_' . $hash );
}

// El token identifica al usuario solo en peticiones a la API REST (incluida la Store API,
// así los pedidos del checkout quedan asociados a la cuenta).
add_filter(
	'determine_current_user',
	function ( $user_id ) {
		if ( $user_id ) {
			return $user_id;
		}
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
		if ( false === strpos( $uri, '/wp-json/' ) && false === strpos( $uri, 'rest_route=' ) ) {
			return $user_id;
		}
		$token = ckoido_token_de_la_peticion();
		return $token ? ( ckoido_usuario_por_token( $token ) ?: $user_id ) : $user_id;
	},
	30
);

// CORS: permitir el encabezado del token (el origen ya lo permite ckoido-cors.php).
add_filter(
	'rest_allowed_cors_headers',
	function ( $encabezados ) {
		$encabezados[] = CKOIDO_ENCABEZADO;
		return $encabezados;
	}
);

// ---------------------------------------------------------------- utilidades

function ckoido_limite( $accion ) {
	$ip    = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';
	$clave = 'ckoido_' . $accion . '_' . md5( $ip );
	$n     = (int) get_transient( $clave );
	if ( $n >= CKOIDO_INTENTOS ) {
		return new WP_Error( 'ckoido_limite', 'Demasiados intentos. Espere unos minutos e intente de nuevo.', array( 'status' => 429 ) );
	}
	set_transient( $clave, $n + 1, 15 * MINUTE_IN_SECONDS );
	return true;
}

function ckoido_perfil( $user_id ) {
	$u        = get_userdata( $user_id );
	$cliente  = new WC_Customer( $user_id );
	$nombre   = $cliente->get_first_name() ?: $u->first_name;
	$apellido = $cliente->get_last_name() ?: $u->last_name;
	return array(
		'email'     => $u->user_email,
		'nombre'    => $nombre,
		'apellidos' => $apellido,
		'desde'     => mysql2date( 'Y-m-d', $u->user_registered ),
		'telefono'  => $cliente->get_billing_phone(),
		'direccion' => $cliente->get_billing_address_1(),
		'ciudad'    => $cliente->get_billing_city(),
		'provincia' => $cliente->get_billing_state(),
		'postal'    => $cliente->get_billing_postcode(),
	);
}

function ckoido_pedidos( $user_id ) {
	$pedidos = wc_get_orders(
		array(
			'customer_id' => $user_id,
			'limit'       => 30,
			'orderby'     => 'date',
			'order'       => 'DESC',
		)
	);
	return array_map(
		function ( $o ) {
			$items = array();
			foreach ( $o->get_items() as $item ) {
				$producto = $item->get_product();
				$items[]  = array(
					'nombre'   => $item->get_name(),
					'cantidad' => $item->get_quantity(),
					'imagen'   => $producto ? (string) wp_get_attachment_image_url( $producto->get_image_id(), 'woocommerce_thumbnail' ) : '',
				);
			}
			return array(
				'numero' => $o->get_order_number(),
				'fecha'  => $o->get_date_created() ? $o->get_date_created()->date( 'Y-m-d' ) : '',
				'estado' => $o->get_status(),
				'estado_texto' => wc_get_order_status_name( $o->get_status() ),
				'total'  => (float) $o->get_total(),
				'moneda' => $o->get_currency(),
				'pago'   => $o->get_payment_method_title(),
				'items'  => $items,
			);
		},
		$pedidos
	);
}

function ckoido_texto( $req, $campo, $max = 120 ) {
	return mb_substr( sanitize_text_field( (string) $req->get_param( $campo ) ), 0, $max );
}

// ---------------------------------------------------------------- rutas

add_action(
	'rest_api_init',
	function () {
		$ns = 'ckoido/v1';

		register_rest_route(
			$ns,
			'/registro',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => function ( WP_REST_Request $req ) {
					$limite = ckoido_limite( 'registro' );
					if ( is_wp_error( $limite ) ) {
						return $limite;
					}
					$email    = sanitize_email( (string) $req->get_param( 'email' ) );
					$password = (string) $req->get_param( 'password' );
					$nombre   = ckoido_texto( $req, 'nombre' );
					$apellido = ckoido_texto( $req, 'apellidos' );
					if ( ! is_email( $email ) ) {
						return new WP_Error( 'ckoido_email', 'Escriba un correo electrónico válido.', array( 'status' => 400 ) );
					}
					if ( strlen( $password ) < 8 ) {
						return new WP_Error( 'ckoido_password', 'La contraseña debe tener al menos 8 caracteres.', array( 'status' => 400 ) );
					}
					if ( '' === $nombre ) {
						return new WP_Error( 'ckoido_nombre', 'Escriba su nombre.', array( 'status' => 400 ) );
					}
					if ( email_exists( $email ) ) {
						return new WP_Error( 'ckoido_existe', 'Ya existe una cuenta con ese correo. Inicie sesión.', array( 'status' => 409 ) );
					}
					$id = wc_create_new_customer(
						$email,
						wc_create_new_customer_username( $email ),
						$password,
						array(
							'first_name' => $nombre,
							'last_name'  => $apellido,
						)
					);
					if ( is_wp_error( $id ) ) {
						return new WP_Error( 'ckoido_registro', wp_strip_all_tags( $id->get_error_message() ), array( 'status' => 400 ) );
					}
					$cliente = new WC_Customer( $id );
					$cliente->set_billing_first_name( $nombre );
					$cliente->set_billing_last_name( $apellido );
					$cliente->set_billing_email( $email );
					$cliente->set_billing_country( 'CR' );
					$cliente->save();
					return array(
						'token'  => ckoido_crear_token( $id ),
						'perfil' => ckoido_perfil( $id ),
					);
				},
			)
		);

		register_rest_route(
			$ns,
			'/login',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => function ( WP_REST_Request $req ) {
					$limite = ckoido_limite( 'login' );
					if ( is_wp_error( $limite ) ) {
						return $limite;
					}
					$email    = trim( (string) $req->get_param( 'email' ) );
					$password = (string) $req->get_param( 'password' );
					$usuario  = wp_authenticate( $email, $password );
					if ( is_wp_error( $usuario ) ) {
						return new WP_Error( 'ckoido_login', 'Correo o contraseña incorrectos.', array( 'status' => 401 ) );
					}
					return array(
						'token'  => ckoido_crear_token( $usuario->ID ),
						'perfil' => ckoido_perfil( $usuario->ID ),
					);
				},
			)
		);

		register_rest_route(
			$ns,
			'/recuperar',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => function ( WP_REST_Request $req ) {
					$limite = ckoido_limite( 'recuperar' );
					if ( is_wp_error( $limite ) ) {
						return $limite;
					}
					$email = sanitize_email( (string) $req->get_param( 'email' ) );
					if ( is_email( $email ) && email_exists( $email ) ) {
						retrieve_password( $email );
					}
					// Misma respuesta exista o no la cuenta (no revela qué correos están registrados).
					return array( 'ok' => true );
				},
			)
		);

		register_rest_route(
			$ns,
			'/cuenta',
			array(
				array(
					'methods'             => 'GET',
					'permission_callback' => 'is_user_logged_in',
					'callback'            => function () {
						$id = get_current_user_id();
						return array(
							'perfil'  => ckoido_perfil( $id ),
							'pedidos' => ckoido_pedidos( $id ),
						);
					},
				),
				array(
					'methods'             => 'POST',
					'permission_callback' => 'is_user_logged_in',
					'callback'            => function ( WP_REST_Request $req ) {
						$id      = get_current_user_id();
						$cliente = new WC_Customer( $id );
						$nombre  = ckoido_texto( $req, 'nombre' );
						$apell   = ckoido_texto( $req, 'apellidos' );
						if ( '' === $nombre ) {
							return new WP_Error( 'ckoido_nombre', 'Escriba su nombre.', array( 'status' => 400 ) );
						}
						$cliente->set_first_name( $nombre );
						$cliente->set_last_name( $apell );
						$cliente->set_billing_first_name( $nombre );
						$cliente->set_billing_last_name( $apell );
						$cliente->set_billing_phone( ckoido_texto( $req, 'telefono', 40 ) );
						$cliente->set_billing_address_1( ckoido_texto( $req, 'direccion', 200 ) );
						$cliente->set_billing_city( ckoido_texto( $req, 'ciudad' ) );
						$cliente->set_billing_state( ckoido_texto( $req, 'provincia', 10 ) );
						$cliente->set_billing_postcode( ckoido_texto( $req, 'postal', 10 ) );
						$cliente->set_billing_country( 'CR' );
						$cliente->save();
						return array( 'perfil' => ckoido_perfil( $id ) );
					},
				),
			)
		);

		register_rest_route(
			$ns,
			'/salir',
			array(
				'methods'             => 'POST',
				'permission_callback' => 'is_user_logged_in',
				'callback'            => function () {
					$token = ckoido_token_de_la_peticion();
					if ( $token ) {
						ckoido_borrar_token( get_current_user_id(), ckoido_hash( $token ) );
					}
					return array( 'ok' => true );
				},
			)
		);
	}
);
