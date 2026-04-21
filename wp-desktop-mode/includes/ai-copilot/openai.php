<?php
/**
 * Desktop Mode — OpenAI Responses API client.
 *
 * Uses the Responses API (POST /v1/responses) instead of Chat Completions.
 * Key differences from Chat Completions:
 *
 *   - `input` array (not `messages`), `instructions` for the system prompt.
 *   - Tool definitions are flat — no nested `function` wrapper.
 *   - Tool calls appear in `output[]` as `{ type: "function_call", call_id, name, arguments }`.
 *   - Tool results go back as `{ type: "function_call_output", call_id, output }` in `input`.
 *   - `previous_response_id` replaces full message-history replay for multi-turn loops.
 *   - Structured output lives under `text.format` (not top-level `response_format`).
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/** Default model. Filterable via `wp_desktop_ai_model`. */
const WPDM_AI_DEFAULT_MODEL = 'gpt-5.4-nano';

/** Responses API endpoint. */
const WPDM_AI_OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';

/** HTTP timeout in seconds. */
const WPDM_AI_REQUEST_TIMEOUT = 30;

// ---------------------------------------------------------------------------
// Shared HTTP layer
// ---------------------------------------------------------------------------

/**
 * POST to the Responses API endpoint and return the decoded response array.
 *
 * All callers go through here so auth headers, timeout, and error handling
 * live in one place.
 *
 * @since 0.14.0
 *
 * @param string $api_key OpenAI secret key.
 * @param array  $body    Already-validated request body.
 * @return array|WP_Error Decoded response or WP_Error.
 */
function wpdm_ai_do_request( $api_key, array $body ) {
	if ( empty( $api_key ) ) {
		return new WP_Error( 'wpdm_ai_no_key', 'No OpenAI API key provided.' );
	}

	$encoded = wp_json_encode( $body );
	if ( false === $encoded ) {
		return new WP_Error( 'wpdm_ai_encode', 'Failed to JSON-encode request body.' );
	}

	$http = wp_remote_post(
		WPDM_AI_OPENAI_ENDPOINT,
		array(
			'timeout' => WPDM_AI_REQUEST_TIMEOUT,
			'headers' => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $api_key,
			),
			'body'    => $encoded,
		)
	);

	if ( is_wp_error( $http ) ) {
		return $http;
	}

	$code     = (int) wp_remote_retrieve_response_code( $http );
	$raw_body = wp_remote_retrieve_body( $http );
	$decoded  = json_decode( $raw_body, true );

	if ( 200 !== $code ) {
		$msg = isset( $decoded['error']['message'] )
			? (string) $decoded['error']['message']
			: "OpenAI returned HTTP {$code}.";
		return new WP_Error( 'wpdm_ai_api_error', $msg, array( 'status' => $code ) );
	}

	if ( ! is_array( $decoded ) ) {
		return new WP_Error( 'wpdm_ai_parse', 'Could not parse OpenAI response body.' );
	}

	if ( isset( $decoded['status'] ) && 'failed' === $decoded['status'] ) {
		$msg = $decoded['error']['message'] ?? 'Response failed with no error message.';
		return new WP_Error( 'wpdm_ai_failed', $msg );
	}

	return $decoded;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Extract the plain-text content from a Responses API response.
 *
 * The Responses API may return the text in any of several shapes depending
 * on the model version and whether structured output is active:
 *
 *   output[].type = "message"
 *     content[].type = "text"        → standard shape
 *     content[].type = "output_text" → shape used when text.format is set
 *   output_text (top-level string)   → compact shape on some endpoints
 *
 * We check all known locations so a future API change doesn't silently
 * break text extraction.
 *
 * @since 0.14.0
 *
 * @param array $response Decoded Responses API response.
 * @return string|null The text content, or null when absent.
 */
function wpdm_ai_extract_text( array $response ) {
	// 1. Walk output[] looking for message items.
	foreach ( $response['output'] ?? array() as $item ) {
		if ( ( $item['type'] ?? '' ) !== 'message' ) {
			continue;
		}
		foreach ( $item['content'] ?? array() as $block ) {
			// Accept both "text" and "output_text" block types.
			if ( isset( $block['text'] ) && is_string( $block['text'] ) ) {
				return $block['text'];
			}
		}
	}

	// 2. Top-level `output_text` shortcut (compact response shape).
	if ( isset( $response['output_text'] ) && is_string( $response['output_text'] ) ) {
		return $response['output_text'];
	}

	return null;
}

/**
 * Return all `function_call` items from a Responses API output array.
 *
 * @since 0.14.0
 *
 * @param array $response Decoded Responses API response.
 * @return array[] Array of function_call output items.
 */
function wpdm_ai_extract_function_calls( array $response ) {
	return array_values(
		array_filter(
			$response['output'] ?? array(),
			static function ( $item ) {
				return ( $item['type'] ?? '' ) === 'function_call';
			}
		)
	);
}

// ---------------------------------------------------------------------------
// Structured-output (analysis jobs — no tools)
// ---------------------------------------------------------------------------

/**
 * Send a single structured-output request to the Responses API.
 *
 * Used by the WP-Cron analysis jobs (post, term, comment). The caller
 * passes a `$messages` array in Chat-Completions shape (with `role` keys);
 * this function maps it to the Responses API shape:
 *
 *   system message  → `instructions`
 *   other messages  → `input`
 *
 * @since 0.14.0
 *
 * @param string $api_key     OpenAI secret key.
 * @param array  $messages    Chat-style messages: `[['role'=>..., 'content'=>...], …]`.
 * @param array  $schema      JSON Schema for the structured output.
 * @param string $schema_name Identifier for the schema (snake_case, no spaces).
 * @param string $model       Model ID. Defaults to {@see WPDM_AI_DEFAULT_MODEL}.
 * @return array|WP_Error Parsed JSON object or WP_Error.
 */
function wpdm_ai_openai_structured_request(
	$api_key,
	array $messages,
	array $schema,
	$schema_name,
	$model = WPDM_AI_DEFAULT_MODEL
) {
	/** @see wp_desktop_ai_model */
	$model = (string) apply_filters( 'wp_desktop_ai_model', $model, $schema_name );

	// Separate the system message from the user/assistant turns.
	$instructions = '';
	$input        = array();
	foreach ( $messages as $msg ) {
		if ( isset( $msg['role'] ) && 'system' === $msg['role'] ) {
			$instructions = (string) ( $msg['content'] ?? '' );
		} else {
			$input[] = $msg;
		}
	}

	$body = array(
		'model' => $model,
		'input' => $input,
		'text'  => array(
			'format' => array(
				'type'   => 'json_schema',
				'name'   => $schema_name,
				'strict' => true,
				'schema' => $schema,
			),
		),
	);
	if ( $instructions !== '' ) {
		$body['instructions'] = $instructions;
	}

	$response = wpdm_ai_do_request( $api_key, $body );
	if ( is_wp_error( $response ) ) {
		return $response;
	}

	$text = wpdm_ai_extract_text( $response );
	if ( ! is_string( $text ) ) {
		return new WP_Error( 'wpdm_ai_empty', 'Responses API returned no text content.' );
	}

	$result = json_decode( $text, true );
	if ( ! is_array( $result ) ) {
		return new WP_Error( 'wpdm_ai_result_parse', 'Could not parse structured output JSON.' );
	}

	return $result;
}

// ---------------------------------------------------------------------------
// Agentic / multi-turn (search loop)
// ---------------------------------------------------------------------------

/**
 * Make one turn of a Responses API agentic loop.
 *
 * On the first turn `$previous_response_id` is null and `$input` contains
 * the user message. On subsequent turns `$previous_response_id` carries
 * the id from the previous response and `$input` contains only the
 * `function_call_output` items — the Responses API reconstructs the full
 * context from the chain automatically.
 *
 * @since 0.14.0
 *
 * @param string      $api_key              OpenAI secret key.
 * @param array       $input                Input items for this turn.
 * @param array       $tools                Tool definitions (flat Responses API format).
 * @param array|null  $text_format          Optional `text.format` object for structured output.
 * @param string      $instructions         Optional system-level instructions.
 * @param string|null $previous_response_id Chains this call to a previous response.
 * @return array|WP_Error
 */
function wpdm_ai_openai_responses_call(
	$api_key,
	array $input,
	array $tools = array(),
	$text_format = null,
	$instructions = '',
	$previous_response_id = null
) {
	$model = (string) apply_filters( 'wp_desktop_ai_model', WPDM_AI_DEFAULT_MODEL, 'agentic_search' );

	$body = array(
		'model' => $model,
		'input' => $input,
	);

	if ( $instructions !== '' ) {
		$body['instructions'] = $instructions;
	}

	if ( ! empty( $tools ) ) {
		$body['tools']       = $tools;
		$body['tool_choice'] = 'auto';
	}

	if ( is_array( $text_format ) ) {
		$body['text'] = array( 'format' => $text_format );
	}

	if ( is_string( $previous_response_id ) && $previous_response_id !== '' ) {
		$body['previous_response_id'] = $previous_response_id;
	}

	return wpdm_ai_do_request( $api_key, $body );
}
