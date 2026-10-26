import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {source,nc,action} from './fixtures/quality.mjs';
const {QualityActionForm}=loadTypescript('src/components/quality/action-form.tsx');
test('canonical two-decimal action quantities and six-decimal field quantities are valid HTML step values',()=>{
 for(const [mode,quantity] of [['internal',2],['outsourced',2],['field',0.000002],['none',0.000002]]){
  const markup=renderToStaticMarkup(React.createElement(QualityActionForm,{action:'action_define',source,nc:{...nc,affected_quantity:quantity},corrective:{...action,execution_mode:mode,quantity},command:async()=>{},busy:false,onClose:()=>{}}));
  const input=markup.match(/<input[^>]*name="quantity"[^>]*>/)?.[0];assert.ok(input);const attribute=name=>Number(input.match(new RegExp(`${name}="([^"]+)"`))[1]);const steps=(attribute('value')-attribute('min'))/attribute('step');assert.ok(Math.abs(steps-Math.round(steps))<1e-8,`${mode} must not produce browser stepMismatch for ${quantity}`);assert.ok(attribute('value')>=attribute('min'));
 }
});
