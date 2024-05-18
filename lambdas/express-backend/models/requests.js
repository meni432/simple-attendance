module.exports.extractRequestUrlFromRequest = function(req) {
    const proxyEvent = req.apiGateway.event;
    const requestUrl = proxyEvent.requestContext.domainName + '/' + proxyEvent.requestContext.stage;
    return `https://${requestUrl}`
};