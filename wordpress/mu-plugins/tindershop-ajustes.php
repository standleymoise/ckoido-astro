<?php
/**
 * Plugin Name: Tindershop – Experiencia de la tienda
 * Description: Elige qué ve el cliente al entrar al sitio en Astro: las tarjetas deslizables (swipe) o la tienda 3D que se recorre caminando. Se configura en Ajustes → Tindershop. Al cambiarlo, el sitio se vuelve a publicar solo (si está el plugin «Publicar el sitio al guardar»).
 * Version: 1.1.0
 *
 * Ruta pública (solo lectura, la lee Astro al compilar):
 *   GET /wp-json/tindershop/v1/ajustes → { experiencia: "tarjetas" | "3d", exhibiciones: { <slug de categoría>: tipo } }
 *
 * Tienda 3D: cada categoría de productos elige cómo se exhibe (Productos → Categorías → editar):
 *   góndola (estantería de súper), perchero (ropa colgada), maniquí (conjuntos), estante (ropa doblada y
 *   accesorios) o exhibidor (pantalla de destacados). Los productos «destacados» de WooCommerce (estrella)
 *   también aparecen en el exhibidor de la entrada.
 */

defined( 'ABSPATH' ) || exit;

const TINDERSHOP_OPCION_EXPERIENCIA = 'tindershop_experiencia';
const TINDERSHOP_META_EXHIBICION   = 'tindershop_exhibicion';

function tindershop_exhibiciones(): array {
	return array(
		'gondola'   => 'Góndola (estantería de supermercado)',
		'perchero'  => 'Perchero (prendas colgadas)',
		'maniqui'   => 'Maniquí (conjuntos completos)',
		'estante'   => 'Estante (prendas dobladas y accesorios)',
		'exhibidor' => 'Exhibidor (pantalla de destacados)',
	);
}

/** { slug de la categoría: tipo } solo de las que no usan la góndola (la de siempre). */
function tindershop_mapa_exhibiciones(): array {
	$mapa  = array();
	$terms = get_terms(
		array(
			'taxonomy'   => 'product_cat',
			'hide_empty' => false,
			'meta_key'   => TINDERSHOP_META_EXHIBICION,
		)
	);
	if ( is_wp_error( $terms ) ) {
		return $mapa;
	}
	foreach ( $terms as $t ) {
		$tipo = (string) get_term_meta( $t->term_id, TINDERSHOP_META_EXHIBICION, true );
		if ( $tipo && 'gondola' !== $tipo && array_key_exists( $tipo, tindershop_exhibiciones() ) ) {
			$mapa[ $t->slug ] = $tipo;
		}
	}
	return $mapa;
}

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
				'callback'            => fn() => array(
					'experiencia'  => tindershop_experiencia(),
					'exhibiciones' => (object) tindershop_mapa_exhibiciones(),
				),
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

// ---------- Exhibición por categoría (Productos → Categorías) ----------
function tindershop_campo_exhibicion( string $actual = 'gondola' ): void {
	echo '<select name="tindershop_exhibicion" id="tindershop_exhibicion">';
	foreach ( tindershop_exhibiciones() as $valor => $texto ) {
		printf( '<option value="%s"%s>%s</option>', esc_attr( $valor ), selected( $actual, $valor, false ), esc_html( $texto ) );
	}
	echo '</select>';
}
add_action(
	'product_cat_add_form_fields',
	function () {
		echo '<div class="form-field"><label for="tindershop_exhibicion">Exhibición en la tienda 3D</label>';
		tindershop_campo_exhibicion();
		echo '<p>Cómo se muestran los productos de esta categoría al recorrer la tienda 3D.</p></div>';
	}
);
add_action(
	'product_cat_edit_form_fields',
	function ( $term ) {
		$actual = (string) get_term_meta( $term->term_id, TINDERSHOP_META_EXHIBICION, true ) ?: 'gondola';
		echo '<tr class="form-field"><th scope="row"><label for="tindershop_exhibicion">Exhibición en la tienda 3D</label></th><td>';
		tindershop_campo_exhibicion( $actual );
		echo '<p class="description">Cómo se muestran los productos de esta categoría al recorrer la tienda 3D.</p></td></tr>';
	}
);
function tindershop_guardar_exhibicion( $term_id ): void {
	if ( ! isset( $_POST['tindershop_exhibicion'] ) || ! current_user_can( 'manage_product_terms' ) ) {
		return;
	}
	$tipo = sanitize_key( wp_unslash( $_POST['tindershop_exhibicion'] ) );
	if ( ! array_key_exists( $tipo, tindershop_exhibiciones() ) ) {
		return;
	}
	$antes = (string) get_term_meta( $term_id, TINDERSHOP_META_EXHIBICION, true );
	update_term_meta( $term_id, TINDERSHOP_META_EXHIBICION, $tipo );
	if ( $antes !== $tipo ) {
		tindershop_pedir_build();
	}
}
add_action( 'created_product_cat', 'tindershop_guardar_exhibicion' );
add_action( 'edited_product_cat', 'tindershop_guardar_exhibicion' );
