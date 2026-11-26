<?php
/**
 * Plugin Name: Tindershop – Experiencia de la tienda
 * Description: Elige qué ve el cliente al entrar al sitio en Astro: las tarjetas deslizables (swipe) o la tienda 3D que se recorre caminando. Se configura en Ajustes → Tindershop. Al cambiarlo, el sitio se vuelve a publicar solo (si está el plugin «Publicar el sitio al guardar»).
 * Version: 1.3.0
 *
 * Ruta pública (solo lectura, la lee Astro al compilar):
 *   GET /wp-json/tindershop/v1/ajustes → { experiencia, exhibiciones: { <slug de categoría>: tipo }, pasillos: [texto, …] }
 *
 * Presencia (tienda 3D con varios compradores a la vez): POST /wp-json/tindershop/v1/presencia
 *   { id, x, z, r, a } → { otros: [ { id, x, z, r, a } ] }. Sin datos personales: un id al azar del navegador,
 *   la posición en la tienda y el aspecto del muñeco. Se borra solo a los 12 segundos sin novedades.
 *
 * Tienda 3D: cada categoría de productos elige cómo se exhibe (Productos → Categorías → editar):
 *   góndola (estantería de súper), perchero (ropa colgada), maniquí (conjuntos), estante (ropa doblada y
 *   accesorios) o exhibidor (pantalla de destacados). Los productos «destacados» de WooCommerce (estrella)
 *   también aparecen en el exhibidor de la entrada.
 */

defined( 'ABSPATH' ) || exit;

const TINDERSHOP_OPCION_EXPERIENCIA = 'tindershop_experiencia';
const TINDERSHOP_META_EXHIBICION   = 'tindershop_exhibicion';
const TINDERSHOP_OPCION_PASILLOS    = 'tindershop_pasillos';
const TINDERSHOP_OPCION_PRESENCIA   = 'tindershop_presencia';
const TINDERSHOP_OPCION_MUSICA      = 'tindershop_musica';         // ids de audios de la biblioteca, separados por coma
const TINDERSHOP_OPCION_SIN_MUSICA  = 'tindershop_musica_apagada'; // '1' = la tienda 3D sin música
// Quién puede cambiar estos ajustes: el administrador y el gestor de la tienda (WooCommerce).
const TINDERSHOP_PERMISO            = 'manage_woocommerce';

/** Canciones elegidas en la biblioteca de medios (dirección y título), en el orden elegido. */
function tindershop_musica(): array {
	$ids = array_filter( array_map( 'absint', explode( ',', (string) get_option( TINDERSHOP_OPCION_MUSICA, '' ) ) ) );
	$lista = array();
	foreach ( $ids as $id ) {
		$url = wp_get_attachment_url( $id );
		if ( $url && str_starts_with( (string) get_post_mime_type( $id ), 'audio/' ) ) {
			$lista[] = array( 'url' => $url, 'titulo' => get_the_title( $id ) );
		}
	}
	return $lista;
}

/** Letreros escritos a mano (uno por línea = un pasillo). Vacío = se arman con las categorías. */
function tindershop_pasillos(): array {
	$texto = (string) get_option( TINDERSHOP_OPCION_PASILLOS, '' );
	return array_values( array_map( 'trim', preg_split( '/\R/', $texto ) ?: array() ) );
}

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
					'pasillos'     => tindershop_pasillos(),
					'musica'       => tindershop_musica(),
					'sinMusica'    => '1' === (string) get_option( TINDERSHOP_OPCION_SIN_MUSICA, '' ),
				),
			)
		);
		register_rest_route(
			'tindershop/v1',
			'/presencia',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'tindershop_presencia',
			)
		);
	}
);

/**
 * Cada comprador avisa dónde está (cada 1–2 s) y recibe dónde están los demás.
 * Se guarda en una sola opción (sin cargar en cada página): alcanza para decenas de compradores a la vez.
 */
function tindershop_presencia( WP_REST_Request $req ) {
	$id = (string) $req->get_param( 'id' );
	if ( ! preg_match( '/^[a-f0-9]{16}$/', $id ) ) {
		return new WP_Error( 'id', 'Identificador inválido.', array( 'status' => 400 ) );
	}
	$num   = fn( $k, $min, $max ) => max( $min, min( $max, round( (float) $req->get_param( $k ), 2 ) ) );
	$ahora = time();
	$todos = get_option( TINDERSHOP_OPCION_PRESENCIA, array() );
	$todos = is_array( $todos ) ? $todos : array();
	// Se borran los que no avisaron en 12 s (cerraron la pestaña) y se guarda este.
	$todos = array_filter( $todos, fn( $p ) => is_array( $p ) && ( $ahora - (int) ( $p['t'] ?? 0 ) ) <= 12 );
	if ( count( $todos ) < 200 || isset( $todos[ $id ] ) ) {
		$todos[ $id ] = array(
			'x' => $num( 'x', -20, 20 ),
			'z' => $num( 'z', -20, 20 ),
			'r' => $num( 'r', -50, 50 ),
			'a' => (int) $num( 'a', 0, 999 ),
			't' => $ahora,
		);
	}
	update_option( TINDERSHOP_OPCION_PRESENCIA, $todos, false );
	$otros = array();
	foreach ( $todos as $otro => $p ) {
		if ( $otro !== $id ) {
			$otros[] = array( 'id' => $otro, 'x' => $p['x'], 'z' => $p['z'], 'r' => $p['r'], 'a' => $p['a'] );
		}
	}
	$res = new WP_REST_Response( array( 'otros' => $otros ) );
	$res->header( 'Cache-Control', 'no-store' );
	return $res;
}

// Al cambiar la experiencia, se pide un build nuevo del sitio (plugin tienda-publicar).
function tindershop_pedir_build(): void {
	if ( function_exists( 'tienda_publicar_programar' ) ) {
		tienda_publicar_programar();
	}
}
add_action( 'update_option_' . TINDERSHOP_OPCION_EXPERIENCIA, 'tindershop_pedir_build' );
add_action( 'add_option_' . TINDERSHOP_OPCION_EXPERIENCIA, 'tindershop_pedir_build' );
add_action( 'update_option_' . TINDERSHOP_OPCION_PASILLOS, 'tindershop_pedir_build' );
add_action( 'add_option_' . TINDERSHOP_OPCION_PASILLOS, 'tindershop_pedir_build' );
foreach ( array( TINDERSHOP_OPCION_MUSICA, TINDERSHOP_OPCION_SIN_MUSICA ) as $opcion ) {
	add_action( 'update_option_' . $opcion, 'tindershop_pedir_build' );
	add_action( 'add_option_' . $opcion, 'tindershop_pedir_build' );
}
// El gestor de la tienda también puede guardar esta página (por defecto WordPress pide «manage_options»).
add_filter( 'option_page_capability_tindershop', fn() => TINDERSHOP_PERMISO );

add_action(
	'admin_menu',
	function () {
		$pagina = add_options_page( 'Tindershop', 'Tindershop', TINDERSHOP_PERMISO, 'tindershop', 'tindershop_pantalla_ajustes' );
		// Selector de la biblioteca de medios, solo en esta página.
		add_action( 'admin_print_scripts-' . $pagina, 'wp_enqueue_media' );
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
		register_setting(
			'tindershop',
			TINDERSHOP_OPCION_PASILLOS,
			array(
				'type'              => 'string',
				'default'           => '',
				// Una línea por pasillo, de hasta 40 letras.
				'sanitize_callback' => fn( $v ) => implode( PHP_EOL, array_map( fn( $l ) => mb_substr( sanitize_text_field( $l ), 0, 40 ), preg_split( '/\R/', (string) $v ) ?: array() ) ),
			)
		);
		register_setting(
			'tindershop',
			TINDERSHOP_OPCION_MUSICA,
			array(
				'type'              => 'string',
				'default'           => '',
				'sanitize_callback' => fn( $v ) => implode( ',', array_slice( array_filter( array_map( 'absint', explode( ',', (string) $v ) ) ), 0, 30 ) ),
			)
		);
		register_setting(
			'tindershop',
			TINDERSHOP_OPCION_SIN_MUSICA,
			array(
				'type'              => 'string',
				'default'           => '',
				'sanitize_callback' => fn( $v ) => '1' === (string) $v ? '1' : '',
			)
		);
	}
);

function tindershop_pantalla_ajustes(): void {
	if ( ! current_user_can( TINDERSHOP_PERMISO ) ) {
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
				<tr>
					<th scope="row"><label for="tindershop-pasillos">Letreros de los pasillos</label></th>
					<td>
						<textarea id="tindershop-pasillos" name="<?php echo esc_attr( TINDERSHOP_OPCION_PASILLOS ); ?>" rows="6" class="large-text" placeholder="Higiene personal&#10;Avena y galletas&#10;Bebidas"><?php echo esc_textarea( (string) get_option( TINDERSHOP_OPCION_PASILLOS, '' ) ); ?></textarea>
						<p class="description">Tienda 3D: una línea por pasillo, de izquierda a derecha al entrar (línea 1 = pasillo 1).
							Una línea vacía, o si no escribe nada, usa los nombres de las categorías que hay en ese pasillo.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Música de la tienda 3D</th>
					<td>
						<?php $musica = tindershop_musica(); ?>
						<input type="hidden" id="tindershop-musica" name="<?php echo esc_attr( TINDERSHOP_OPCION_MUSICA ); ?>" value="<?php echo esc_attr( (string) get_option( TINDERSHOP_OPCION_MUSICA, '' ) ); ?>">
						<ol id="tindershop-musica-lista" style="margin:0 0 8px 18px">
							<?php foreach ( $musica as $c ) : ?>
								<li><?php echo esc_html( $c['titulo'] ); ?></li>
							<?php endforeach; ?>
						</ol>
						<p id="tindershop-musica-vacia" class="description" <?php echo $musica ? 'hidden' : ''; ?>>Sin canciones propias: suenan las 4 canciones de fábrica de Tindershop.</p>
						<p>
							<button type="button" class="button" id="tindershop-musica-elegir">Elegir canciones (MP3)</button>
							<button type="button" class="button-link" id="tindershop-musica-quitar">Quitar todas</button>
						</p>
						<label><input type="checkbox" name="<?php echo esc_attr( TINDERSHOP_OPCION_SIN_MUSICA ); ?>" value="1" <?php checked( '1', (string) get_option( TINDERSHOP_OPCION_SIN_MUSICA, '' ) ); ?>> Tienda 3D sin música</label>
						<p class="description">Suben y eligen archivos de audio de la biblioteca de medios; suenan en ese orden, una tras otra, y vuelven a empezar.
							Use música propia o con licencia para uso comercial. Cada cliente puede silenciarla en la tienda.</p>
						<script>
							( function () {
								const campo = document.getElementById( 'tindershop-musica' );
								const lista = document.getElementById( 'tindershop-musica-lista' );
								const vacia = document.getElementById( 'tindershop-musica-vacia' );
								let marco = null;
								document.getElementById( 'tindershop-musica-elegir' ).addEventListener( 'click', function () {
									if ( ! marco ) {
										marco = wp.media( { title: 'Música de la tienda 3D', button: { text: 'Usar estas canciones' }, library: { type: 'audio' }, multiple: 'add' } );
										marco.on( 'select', function () {
											const elegidas = marco.state().get( 'selection' ).toJSON();
											campo.value = elegidas.map( ( a ) => a.id ).join( ',' );
											lista.innerHTML = '';
											elegidas.forEach( ( a ) => {
												const li = document.createElement( 'li' );
												li.textContent = a.title;
												lista.appendChild( li );
											} );
											vacia.hidden = elegidas.length > 0;
										} );
									}
									marco.open();
								} );
								document.getElementById( 'tindershop-musica-quitar' ).addEventListener( 'click', function () {
									campo.value = '';
									lista.innerHTML = '';
									vacia.hidden = false;
								} );
							} )();
						</script>
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
