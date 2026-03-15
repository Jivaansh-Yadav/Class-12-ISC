(function(){
  'use strict';
  if(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent))return;
  var D=150;
  var s=document.createElement('style');
  s.textContent=
    '@keyframes __pgIn{from{opacity:0;transform:scale(.96) translateZ(0)}to{opacity:1;transform:scale(1) translateZ(0)}}'+
    '@keyframes __pgOut{from{opacity:1;transform:scale(1) translateZ(0)}to{opacity:0;transform:scale(.96) translateZ(0)}}'+
    'body.__pg-in{animation:__pgIn '+D+'ms ease both;transform-origin:center}'+
    'body.__pg-out{animation:__pgOut '+D+'ms ease forwards;transform-origin:center;pointer-events:none}';
  document.head.appendChild(s);

  function enter(){
    document.body.classList.remove('__pg-out');
    document.body.classList.add('__pg-in');
    document.body.addEventListener('animationend',function done(){
      document.body.removeEventListener('animationend',done);
      document.body.classList.remove('__pg-in');
    });
  }

  var going=false;
  function go(href){
    if(going)return;
    going=true;
    document.body.classList.remove('__pg-in');
    document.body.classList.add('__pg-out');
    setTimeout(function(){window.location.href=href;},D-10);
  }

  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(!a)return;
    var h=a.getAttribute('href');
    if(!h)return;
    if(/^https?:\/\//i.test(h)||h.indexOf('//')==0||h[0]==='#'||/^(mailto|tel|javascript):/i.test(h)||a.hasAttribute('download')||(a.target&&a.target!=='_self'&&a.target!==''))return;
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    go(h);
  },true);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){requestAnimationFrame(function(){requestAnimationFrame(enter);});});
  }else{
    requestAnimationFrame(function(){requestAnimationFrame(enter);});
  }
}());
