const {verifyAccessToken}=require('../modules/auth/auth.tokens');
function createAuthMiddleware({users}={}) {
 return async function auth(req,res,next) {
  const header=req.headers.authorization||req.headers.Authorization;
  if(!header||!header.startsWith('Bearer '))return res.status(401).json({error:'Authorization bearer token required'});
  let decoded;
  try{decoded=verifyAccessToken(header.slice(7).trim());}
  catch{return res.status(401).json({error:'Invalid or expired token'});}
  let user;
  try{user=await (users||require('../modules/users/user.repository')).findById(decoded.sub);}
  catch{return res.status(503).json({error:'Account service unavailable. Please try again.'});}
  if(!user)return res.status(401).json({error:'Account not found'});
  // Allow safe retries after a response is lost; the original deadline is retained.
  const isDeletionRetry=req.method==='POST'&&req.route?.path==='/me/deletion-request';
  if(user.deletionRequest?.status==='pending'&&!isDeletionRetry)return res.status(403).json({error:'Account deletion requested',code:'ACCOUNT_DELETION_PENDING'});
  req.user={id:decoded.sub,email:decoded.email,role:decoded.role||'user',sessionId:decoded.sessionId};
  return next();
 };
}
module.exports=createAuthMiddleware();
module.exports.createAuthMiddleware=createAuthMiddleware;
