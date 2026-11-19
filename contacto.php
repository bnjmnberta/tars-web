<?php
/**
 * Contact form of the static site. It receives what js/mail.js sends (data-mode="own"), checks it
 * and mails it to TARS with mail(). Every message that passes the checks is also kept in
 * datos/mensajes.log, a folder the web server refuses to serve, so nothing is lost if the mail
 * never arrives.
 *
 * Guards: POST with JSON only, same-site origin only, a hidden trap field, length caps, no line
 * breaks in single-line fields (no header injection), the recipient fixed here, and limits of one
 * message every 20 seconds and five an hour per visitor plus 100 a day for the whole site.
 */

const TARS_TO     = 'tarssolucionesdigitales@gmail.com';
const TARS_FROM   = 'noreply@tarsestudio.com';
const GAP_SECONDS = 20;
const HOUR_LIMIT  = 5;
const DAY_LIMIT   = 100;
const LOG_MAX     = 2000000; // bytes; the log is rotated once
const LOG_DAYS    = 730;     // messages older than this are deleted from the log (24 months)

function reply($status, $ok, $message = '')
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($ok ? array('success' => true) : array('success' => false, 'message' => $message), JSON_UNESCAPED_UNICODE);
    exit;
}

/** One line of text (no control characters) or, with $multiline, text that keeps its line breaks. */
function clean($value, $max, $multiline = false)
{
    if (!is_string($value)) {
        return '';
    }
    $value = str_replace("\0", '', $value);
    if ($multiline) {
        $value = preg_replace('/[^\P{C}\n\t]/u', '', str_replace("\r", '', $value));
    } else {
        $value = preg_replace('/\p{C}+/u', ' ', $value);
    }
    if (!is_string($value)) { // not valid UTF-8
        return '';
    }
    return trim(mb_substr($value, 0, $max, 'UTF-8'));
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    reply(405, false, 'Método no permitido.');
}

// the browser says which page sent it: it has to be this same site
$source = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
$from   = strtolower((string) parse_url($source, PHP_URL_HOST));
$own    = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
if ('' === $from || $from !== $own) {
    reply(403, false, 'Origen no permitido.');
}

if (0 !== stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
    reply(415, false, 'Formato no permitido.');
}
$data = json_decode((string) file_get_contents('php://input', false, null, 0, 30000), true);
if (!is_array($data)) {
    reply(400, false, 'Pedido inválido.');
}

// trap field: a person never sees it. Answer "ok" so a bot learns nothing.
if (!empty($data['_honey'])) {
    reply(200, true);
}

$name    = clean($data['name'] ?? '', 120);
$phone   = clean($data['phone'] ?? '', 60);
$subject = clean($data['_subject'] ?? '', 160);
$message = clean($data['message'] ?? '', 6000, true);
$email   = clean($data['email'] ?? '', 160);
if ('' !== $email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $email = '';
}
if ('' === $name || '' === $message || ('' === $email && '' === $phone)) {
    reply(422, false, 'Faltan datos.');
}
if ('' === $subject) {
    $subject = 'Consulta TARS — ' . $name;
}

/* ---------- limits and log live in datos/ ---------- */
$dir = __DIR__ . '/datos';
if (!is_dir($dir)) {
    @mkdir($dir, 0750, true);
    @file_put_contents($dir . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
    @file_put_contents($dir . '/index.html', '');
}
$lock = is_dir($dir) && is_writable($dir) ? @fopen($dir . '/limites.json', 'c+') : false;
if (!$lock || !flock($lock, LOCK_EX)) {
    reply(500, false, 'No se pudo enviar.');
}

$now   = time();
$today = gmdate('Y-m-d');
$state = json_decode((string) stream_get_contents($lock), true);
$state = is_array($state) ? $state : array();
if (($state['day'] ?? '') !== $today) {
    $state['day'] = $today;
    $state['n']   = 0;
}
$visitors = isset($state['ips']) && is_array($state['ips']) ? $state['ips'] : array();
foreach ($visitors as $k => $v) {
    if ($now - (int) ($v['last'] ?? 0) > 3600) {
        unset($visitors[$k]);
    }
}
$ip   = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$key  = hash('sha256', $ip);
$mine = $visitors[$key] ?? array('count' => 0, 'last' => 0);

$save = function () use ($lock, &$state, &$visitors) {
    $state['ips'] = $visitors;
    ftruncate($lock, 0);
    rewind($lock);
    fwrite($lock, json_encode($state));
    fflush($lock);
    flock($lock, LOCK_UN);
};

if ((int) $state['n'] >= DAY_LIMIT) {
    $save();
    reply(429, false, 'Hoy se alcanzó el límite de mensajes.');
}
if ($now - (int) $mine['last'] < GAP_SECONDS || (int) $mine['count'] >= HOUR_LIMIT) {
    $save();
    reply(429, false, 'Demasiados mensajes seguidos.');
}

/* ---------- the mail ---------- */
$lines   = array($message, '', '— Enviado desde el formulario de ' . ($_SERVER['HTTP_HOST'] ?? 'tarsestudio.com'));
$headers = array(
    'From: TARS Web <' . TARS_FROM . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
);
if ('' !== $email) {
    $label     = '=?UTF-8?B?' . base64_encode($name) . '?=';
    $headers[] = 'Reply-To: ' . $label . ' <' . $email . '>';
}
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$body           = implode("\n", $lines);
$sent           = @mail(TARS_TO, $encodedSubject, $body, implode("\r\n", $headers), '-f' . TARS_FROM);
if (!$sent) {
    $sent = @mail(TARS_TO, $encodedSubject, $body, implode("\r\n", $headers));
}

/* ---------- the log keeps every message, sent or not, for LOG_DAYS days ---------- */
$logFile = $dir . '/mensajes.log';
$oldLog  = $dir . '/mensajes.1.log';
if (($state['purged'] ?? '') !== $today) { // once a day, while this request holds the lock
    $cut = $now - LOG_DAYS * 86400;
    foreach (array($logFile, $oldLog) as $file) {
        if (!is_file($file)) {
            continue;
        }
        $keep = array();
        foreach ((array) file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $row = json_decode($line, true);
            if (is_array($row) && isset($row['t']) && (int) strtotime($row['t']) >= $cut) {
                $keep[] = $line;
            }
        }
        if ($keep) {
            @file_put_contents($file, implode("\n", $keep) . "\n");
        } elseif ($file === $oldLog) {
            @unlink($file);
        } else {
            @file_put_contents($file, '');
        }
    }
    $state['purged'] = $today;
}
if (is_file($logFile) && filesize($logFile) > LOG_MAX) {
    @rename($logFile, $oldLog);
}
$entry = json_encode(
    array(
        't'       => gmdate('c'),
        'ip'      => $ip,
        'name'    => $name,
        'email'   => $email,
        'phone'   => $phone,
        'subject' => $subject,
        'message' => $message,
        'mail'    => (bool) $sent,
    ),
    JSON_UNESCAPED_UNICODE
) . "\n";
$log = @fopen($logFile, 'a');
if ($log) {
    flock($log, LOCK_EX);
    fwrite($log, $entry);
    fflush($log);
    flock($log, LOCK_UN);
    fclose($log);
}

if ($sent) {
    $state['n']        = (int) $state['n'] + 1;
    $visitors[$key]    = array('count' => (int) $mine['count'] + 1, 'last' => $now);
    $save();
    reply(200, true);
}
$save();
reply(500, false, 'No se pudo enviar.');
