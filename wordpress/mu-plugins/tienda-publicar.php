<?php
/**
 * Plugin Name: Tienda – Publicar el sitio al guardar
 * Description: Cuando se publica, edita, despublica o borra un producto o un contenido de ACF/CPT UI (testimonios, banners…), le pide a GitHub que vuelva a compilar el sitio en Astro. Junta los cambios de un minuto en un solo aviso. Se configura en Ajustes → Publicar sitio (o en wp-config.php). Sin configurar, el sitio igual se recompila una vez al día.
 * Version: 1.1.0
 *
 * Configuración (cualquiera de las dos; wp-config.php manda si están las dos):
 *   - Ajustes → Publicar sitio: repositorio y token (el token no se vuelve a mostrar después de guardarlo).
 *   - wp-config.php (antes de «That's all, stop editing!»):
 *       define( 'TIENDA_GITHUB_REPO', 'usuario/mi-tienda' );
 *       define( 'TIENDA_GITHUB_TOKEN', 'github_pat_…' );
 *       // Opcional: tipos que disparan el build (por defecto productos, testimonios y banners).
 *       // define( 'TIENDA_TIPOS_PUBLICAR', 'product,testimonios,banners,sucursales' );
 *
 * Token: GitHub → Settings → Developer settings → Fine-grained tokens, SOLO ese repositorio, permiso
 * «Contents: Read and write». Vive solo en el servidor: nunca llega al navegador ni al sitio en Astro.
 * Funciona como mu-plugin (wp-content/mu-plugins) o como plugin normal (Plugins → Añadir → Subir).
 */

defined( 'ABSPATH' ) || exit;

const TIENDA_PUBLICAR_EVENTO = 'tienda_publicar_aviso';
const TIENDA_PUBLICAR_ESTADO = 'tienda_publicar_ultimo';
const TIENDA_PUBLICAR_AJUSTES = 'tienda_publicar_ajustes';

/** Repositorio «usuario/repo»: wp-config.php o el ajuste guardado. */
function tienda_publicar_repo(): string {
	if ( defined( 'TIENDA_GITHUB_REPO' ) ) {
		return (string) TIENDA_GITHUB_REPO;
	}
	$a = get_option( TIENDA_PUBLICAR_AJUSTES, array() );
	return is_array( $a ) ? (string) ( $a['repo'] ?? '' ) : '';
}

function tienda_publicar_token(): string {
	if ( defined( 'TIENDA_GITHUB_TOKEN' ) ) {
		return (string) TIENDA_GITHUB_TOKEN;
	}
	$a = get_option( TIENDA_PUBLICAR_AJUSTES, array() );
	return is_array( $a ) ? (string) ( $a['token'] ?? '' ) : '';
}

function tienda_publicar_configurado(): bool {
	return (bool) preg_match( '#^[\w.-]+/[\w.-]+$#', tienda_publicar_repo() ) && '' !== tienda_publicar_token();
}

function tienda_publicar_tipos(): array {
	$tipos = defined( 'TIENDA_TIPOS_PUBLICAR' ) ? (string) TIENDA_TIPOS_PUBLICAR : 'product,testimonios,banners';
	return array_filter( array_map( 'trim', explode( ',', $tipos ) ) );
}

/** Programa un aviso dentro de un minuto (si ya hay uno pendiente, no agrega otro). */
function tienda_publicar_programar(): void {
	if ( tienda_publicar_configurado() && ! wp_next_scheduled( TIENDA_PUBLICAR_EVENTO ) ) {
		wp_schedule_single_event( time() + 60, TIENDA_PUBLICAR_EVENTO );
	}
}

// Solo cuando cambia algo que se ve en el sitio: lo publicado, o lo que deja de estar publicado.
add_action(
	'transition_post_status',
	function ( $nuevo, $viejo, $post ) {
		if ( ! in_array( $post->post_type, tienda_publicar_tipos(), true ) ) {
			return;
		}
		if ( 'publish' !== $nuevo && 'publish' !== $viejo ) {
			return; // borradores y revisiones: el sitio no cambia
		}
		if ( wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return;
		}
		tienda_publicar_programar();
	},
	10,
	3
);

// Precio o stock cambiados desde la lista de productos, la edición rápida o un pedido.
add_action( 'woocommerce_product_set_stock_status', 'tienda_publicar_programar' );
add_action( 'woocommerce_update_product', 'tienda_publicar_programar' );

/** Pide el build a GitHub (POST /repos/{repo}/dispatches) y guarda el resultado. Devuelve el código HTTP. */
function tienda_publicar_avisar(): int {
	if ( ! tienda_publicar_configurado() ) {
		return 0;
	}
	$respuesta = wp_remote_post(
		'https://api.github.com/repos/' . tienda_publicar_repo() . '/dispatches',
		array(
			'timeout' => 15,
			'headers' => array(
				'Authorization'        => 'Bearer ' . tienda_publicar_token(),
				'Accept'               => 'application/vnd.github+json',
				'X-GitHub-Api-Version' => '2022-11-28',
				'User-Agent'           => 'tienda-publicar',
			),
			'body'    => wp_json_encode( array( 'event_type' => 'tienda-actualizada' ) ),
		)
	);
	$codigo = is_wp_error( $respuesta ) ? 0 : (int) wp_remote_retrieve_response_code( $respuesta );
	update_option(
		TIENDA_PUBLICAR_ESTADO,
		array(
			'fecha'  => time(),
			'codigo' => $codigo,
			'error'  => is_wp_error( $respuesta ) ? $respuesta->get_error_message() : '',
		),
		false
	);
	return $codigo;
}
add_action( TIENDA_PUBLICAR_EVENTO, 'tienda_publicar_avisar' );

function tienda_publicar_motivo( int $codigo ): string {
	$motivos = array(
		204 => 'listo: GitHub recibió el aviso y está publicando el sitio',
		0   => 'no se pudo conectar con GitHub',
		401 => 'el token no es válido o venció',
		403 => 'el token no tiene permiso «Contents: Read and write» en ese repositorio',
		404 => 'el repositorio no existe o el token no tiene acceso a él',
	);
	return $motivos[ $codigo ] ?? 'GitHub respondió ' . $codigo;
}

// ---------- Ajustes → Publicar sitio ----------
add_action(
	'admin_menu',
	function () {
		add_options_page( 'Publicar sitio', 'Publicar sitio', 'manage_options', 'tienda-publicar', 'tienda_publicar_pantalla' );
	}
);

add_action(
	'admin_post_tienda_publicar_guardar',
	function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Sin permiso.' );
		}
		check_admin_referer( 'tienda_publicar_guardar' );
		$actual = get_option( TIENDA_PUBLICAR_AJUSTES, array() );
		$actual = is_array( $actual ) ? $actual : array();
		$repo   = sanitize_text_field( wp_unslash( $_POST['repo'] ?? '' ) );
		$token  = trim( sanitize_text_field( wp_unslash( $_POST['token'] ?? '' ) ) );
		$nuevo  = array(
			'repo'  => preg_match( '#^[\w.-]+/[\w.-]+$#', $repo ) ? $repo : '',
			// Vacío = conservar el token guardado (el campo nunca lo vuelve a mostrar).
			'token' => '' !== $token ? $token : ( $actual['token'] ?? '' ),
		);
		if ( ! empty( $_POST['borrar_token'] ) ) {
			$nuevo['token'] = '';
		}
		update_option( TIENDA_PUBLICAR_AJUSTES, $nuevo, false );
		$prueba = ! empty( $_POST['probar'] ) ? tienda_publicar_avisar() : null;
		$url    = add_query_arg(
			array_filter(
				array(
					'page'    => 'tienda-publicar',
					'guardado' => 1,
					'prueba'  => null === $prueba ? null : (string) $prueba,
				),
				fn( $v ) => null !== $v
			),
			admin_url( 'options-general.php' )
		);
		wp_safe_redirect( $url );
		exit;
	}
);

function tienda_publicar_pantalla(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$en_config   = defined( 'TIENDA_GITHUB_REPO' ) || defined( 'TIENDA_GITHUB_TOKEN' );
	$hay_token   = '' !== tienda_publicar_token();
	$ultimo      = get_option( TIENDA_PUBLICAR_ESTADO );
	?>
	<div class="wrap">
		<h1>Publicar sitio</h1>
		<p>Cuando se guarda un producto, un testimonio o un banner, WordPress le avisa a GitHub y el sitio en Astro
			se vuelve a publicar solo (tarda 1–2 minutos). Sin esto, el sitio se actualiza una vez al día.</p>
		<?php if ( isset( $_GET['prueba'] ) ) : ?>
			<?php $c = (int) $_GET['prueba']; ?>
			<div class="notice <?php echo 204 === $c ? 'notice-success' : 'notice-error'; ?>"><p><strong>Prueba:</strong> <?php echo esc_html( tienda_publicar_motivo( $c ) ); ?>.</p></div>
		<?php elseif ( isset( $_GET['guardado'] ) ) : ?>
			<div class="notice notice-success"><p>Guardado.</p></div>
		<?php endif; ?>
		<?php if ( $en_config ) : ?>
			<p><strong>Configurado en <code>wp-config.php</code></strong> (repositorio <code><?php echo esc_html( tienda_publicar_repo() ); ?></code>). Para cambiarlo, edite ese archivo.</p>
		<?php else : ?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="tienda_publicar_guardar">
			<?php wp_nonce_field( 'tienda_publicar_guardar' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="tp-repo">Repositorio de GitHub</label></th>
					<td><input id="tp-repo" name="repo" type="text" class="regular-text" placeholder="usuario/mi-tienda" value="<?php echo esc_attr( tienda_publicar_repo() ); ?>">
						<p class="description">El repositorio del sitio en Astro, como <code>usuario/nombre</code>.</p></td>
				</tr>
				<tr>
					<th scope="row"><label for="tp-token">Token de GitHub</label></th>
					<td><input id="tp-token" name="token" type="password" class="regular-text" autocomplete="new-password" placeholder="<?php echo $hay_token ? 'Guardado (dejar vacío para conservarlo)' : 'github_pat_…'; ?>">
						<p class="description">Fine-grained token con acceso <strong>solo</strong> a ese repositorio y el permiso «Contents: Read and write». Después de guardarlo no se vuelve a mostrar.</p>
						<?php if ( $hay_token ) : ?>
							<label><input type="checkbox" name="borrar_token" value="1"> Borrar el token guardado</label>
						<?php endif; ?></td>
				</tr>
			</table>
			<p class="submit">
				<button class="button button-primary" name="probar" value="1">Guardar y probar</button>
				<button class="button" name="probar" value="">Solo guardar</button>
			</p>
		</form>
		<?php endif; ?>
		<?php if ( is_array( $ultimo ) ) : ?>
			<p>Último aviso: <?php echo esc_html( wp_date( 'j M Y H:i', $ultimo['fecha'] ) ); ?> — <?php echo esc_html( tienda_publicar_motivo( (int) $ultimo['codigo'] ) ); ?>.</p>
		<?php endif; ?>
		<p>Tipos que publican el sitio: <code><?php echo esc_html( implode( ', ', tienda_publicar_tipos() ) ); ?></code>.</p>
	</div>
	<?php
}

// Aviso en el escritorio solo si el último pedido a GitHub falló.
add_action(
	'admin_notices',
	function () {
		if ( ! current_user_can( 'manage_options' ) || ! tienda_publicar_configurado() ) {
			return;
		}
		$ultimo = get_option( TIENDA_PUBLICAR_ESTADO );
		if ( is_array( $ultimo ) && 204 !== (int) $ultimo['codigo'] ) {
			printf(
				'<div class="notice notice-error"><p><strong>Tienda (Astro):</strong> el último aviso para actualizar el sitio falló (%s, %s). Revise <a href="%s">Ajustes → Publicar sitio</a>; mientras tanto, los cambios se verán en la actualización diaria.</p></div>',
				esc_html( tienda_publicar_motivo( (int) $ultimo['codigo'] ) ),
				esc_html( wp_date( 'j M H:i', $ultimo['fecha'] ) ),
				esc_url( admin_url( 'options-general.php?page=tienda-publicar' ) )
			);
		}
	}
);
