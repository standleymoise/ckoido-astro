<?php
/**
 * Plugin Name: Tindershop – Experiencia de la tienda
 * Description: Elige qué ve el cliente al entrar al sitio en Astro: las tarjetas deslizables (swipe) o la tienda 3D que se recorre caminando. Se configura en Ajustes → Tindershop. Al cambiarlo, el sitio se vuelve a publicar solo (si está el plugin «Publicar el sitio al guardar»).
 * Version: 1.0.0
 *
 * Ruta pública (solo lectura, la lee Astro al compilar): GET /wp-json/tindershop/v1/ajustes → { experiencia: "tarjetas" | "3d" }
 */

defined( 'ABSPATH' ) || exit;

const TINDERSHOP_OPCION_EXPERIENCIA = 'tindershop_experiencia';

function tindershop_experiencias(): array {
	return array(
		'tarjetas' => 'Tarjetas deslizables (swipe)',
		'3d'       => 'Tienda 3D (recorrido virtual)',
	);
}

function tindershop_experiencia(): string {
	$valor = (string) get_option( TINDERSHOP_OPCION_EXPERIENCIA, 'tarjetas' );
	return array_key_exists( $valor, tindershop_experiencias() ) ? $valor : 'tarjetas';
}

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'tindershop/v1',
			'/ajustes',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => fn() => array( 'experiencia' => tindershop_experiencia() ),
			)
		);
	}
);

// Al cambiar la experiencia, se pide un build nuevo del sitio (plugin tienda-publicar).
function tindershop_pedir_build(): void {
	if ( function_exists( 'tienda_publicar_programar' ) ) {
		tienda_publicar_programar();
	}
}
add_action( 'update_option_' . TINDERSHOP_OPCION_EXPERIENCIA, 'tindershop_pedir_build' );
add_action( 'add_option_' . TINDERSHOP_OPCION_EXPERIENCIA, 'tindershop_pedir_build' );

add_action(
	'admin_menu',
	function () {
		add_options_page( 'Tindershop', 'Tindershop', 'manage_options', 'tindershop', 'tindershop_pantalla_ajustes' );
	}
);

add_action(
	'admin_init',
	function () {
		register_setting(
			'tindershop',
			TINDERSHOP_OPCION_EXPERIENCIA,
			array(
				'type'              => 'string',
				'default'           => 'tarjetas',
				'sanitize_callback' => fn( $v ) => array_key_exists( (string) $v, tindershop_experiencias() ) ? (string) $v : 'tarjetas',
			)
		);
	}
);

function tindershop_pantalla_ajustes(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$actual = tindershop_experiencia();
	?>
	<div class="wrap">
		<h1>Tindershop</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'tindershop' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">Experiencia de la tienda</th>
					<td>
						<fieldset>
							<?php foreach ( tindershop_experiencias() as $valor => $texto ) : ?>
								<label style="display:block;margin-bottom:8px">
									<input type="radio" name="<?php echo esc_attr( TINDERSHOP_OPCION_EXPERIENCIA ); ?>" value="<?php echo esc_attr( $valor ); ?>" <?php checked( $actual, $valor ); ?>>
									<?php echo esc_html( $texto ); ?>
								</label>
							<?php endforeach; ?>
							<p class="description">Es lo que ve el cliente al entrar al sitio. La otra experiencia sigue disponible en su propia dirección
								(<code>/tienda-3d/</code> o <code>/tarjetas/</code>). Al guardar, el sitio se vuelve a publicar en 1–2 minutos.</p>
						</fieldset>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Guardar' ); ?>
		</form>
	</div>
	<?php
}
