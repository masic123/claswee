'use strict';

const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

const BODY = {
  ok: false,
  code: 'UPGRADE_REQUIRED',
  error: '同步服务已升级，请刷新 Claswee 并输入房间密码',
  message: '同步服务已升级，请刷新 Claswee 并输入房间密码'
};

exports.main = async function main(event) {
  const isHttp = !!(event && (event.httpMethod || event.requestContext || event.headers));
  if (!isHttp) return BODY;
  if (String(event.httpMethod || '').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  return { statusCode: 426, headers: CORS, body: JSON.stringify(BODY) };
};
